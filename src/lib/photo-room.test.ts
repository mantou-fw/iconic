import { describe, expect, test } from 'vitest';
import type { RoomImport } from './ai-imports';
import { PHOTO_ROOM_MAX_JSON, PhotoRoomInputError, demoPhotoRoom, photoRoomPrompt, readPhotoRoomDraft } from './photo-room';
import { parseProject } from './project';

const fixture: RoomImport = {
  importId: 'existing-photo-draft',
  mode: 'append',
  room: { name: 'Site visit', width: 4.2, depth: 6, height: 2.7 },
  dimensionBasis: 'estimated',
  provenance: {
    confidence: 'low',
    sources: [{ label: 'room.jpg', excerpt: 'One item is visible near the centre.' }],
    assumptions: ['The rear of the room was occluded.'],
  },
  items: [{
    kind: 'desk', label: 'Review table', position: { x: 2, y: 0.375, z: 3 },
    size: { w: 1.8, h: 0.75, d: 0.8 }, rotation: 0, mount: 'floor',
  }],
};

describe('Photo room draft', () => {
  test('validates and loads the bundled source as an estimated, editable independent project', () => {
    const draft = demoPhotoRoom();
    const project = parseProject(JSON.stringify(draft.project));
    expect(draft.source).toBe('demo');
    expect(draft.dimensionBasis).toBe('estimated');
    expect(project.nodes).toEqual([]);
    expect(project.edges).toEqual([]);
    expect(project.drawings).toEqual([]);
    expect(project.room).toMatchObject({ width: 4.2, depth: 6, height: 2.75 });
    expect(project.roomItems).toHaveLength(9);
    expect(project.roomItems?.filter(item => item.kind === 'chair')).toHaveLength(4);
    expect(project.roomItems?.find(item => item.kind === 'table')?.size.d).toBe(2.4);
    expect(project.roomItems?.find(item => item.kind === 'tv')?.position.z).toBeLessThan(0.1);
    expect(project.room?.imports?.[0]?.provenance.assumptions.join(' ')).toMatch(/authored.*2\.4 m/);
    expect(project.roomItems?.map(item => item.id)).toEqual(demoPhotoRoom().project.roomItems?.map(item => item.id));
  });

  test('accepts narrowly fenced JSON, keeps source notes and records the dimensional anchor', () => {
    const json = JSON.stringify(fixture);
    const raw = readPhotoRoomDraft(json);
    expect(raw.source).toBe('external');
    expect(raw.provenance).toEqual(fixture.provenance);
    const fence = '\x60'.repeat(3);
    const draft = readPhotoRoomDraft(fence + 'json\n' + json + '\n' + fence, { axis: 'width', meters: 4.2 });
    expect(draft.provenance.assumptions).toEqual([...fixture.provenance.assumptions, 'User-supplied scale reference: room width = 4.2 m.']);
    expect(draft.project.room?.imports).toEqual([{
      importId: fixture.importId, dimensionBasis: 'estimated', provenance: draft.provenance,
    }]);
    expect(draft.project.roomItems?.[0]).toMatchObject({ id: 'photo-item-1', label: 'Review table', importId: fixture.importId });
    expect(fixture.provenance.assumptions).toHaveLength(1);
  });

  test('refuses to re-scale a draft silently, and rejects invalid user anchors', () => {
    const raw = JSON.stringify(fixture);
    expect(() => readPhotoRoomDraft(raw, { axis: 'width', meters: 4.1 })).toThrow('does not match the known room dimension');
    expect(() => readPhotoRoomDraft(raw, { axis: 'width', meters: 0 })).toThrow('valid known room dimension');
    expect(() => photoRoomPrompt({ axis: 'height', meters: Infinity })).toThrow('valid known room dimension');
  });

  test('does not accept a measured claim based on a photo and only one supplied axis', () => {
    const draft = readPhotoRoomDraft(JSON.stringify({
      ...fixture, mode: 'replace', dimensionBasis: 'measured', provenance: { ...fixture.provenance, assumptions: [] },
    }), { axis: 'depth', meters: 6 });
    expect(draft.dimensionBasis).toBe('estimated');
    expect(draft.project.room?.imports?.[0]?.dimensionBasis).toBe('estimated');
    expect(draft.provenance.assumptions.join(' ')).toMatch(/unverified.*room depth = 6 m/);
    expect(draft.project.nodes).toEqual([]);
  });

  test('requires one bounded JSON object, no surrounding narrative, and no unexplained estimates', () => {
    expect(() => readPhotoRoomDraft('Here is the draft: ' + JSON.stringify(fixture))).toThrow('Paste a JSON room draft');
    expect(() => readPhotoRoomDraft('[]')).toThrow(PhotoRoomInputError);
    expect(() => readPhotoRoomDraft(JSON.stringify({ ...fixture, provenance: { ...fixture.provenance, assumptions: [] } })))
      .toThrow('does not match the required format');
    expect(() => readPhotoRoomDraft('中'.repeat(PHOTO_ROOM_MAX_JSON / 2))).toThrow('too large');
    expect(() => readPhotoRoomDraft(JSON.stringify({ ...fixture, items: Array(81).fill(fixture.items[0]) })))
      .toThrow('up to 80 items');
    expect(() => readPhotoRoomDraft(JSON.stringify({ ...fixture, room: { ...fixture.room, height: 60 } })))
      .toThrow('outside the preview range');
  });

  test('enforces the existing rotated-footprint validation, displaying a specific path and error detail', () => {
    try {
      readPhotoRoomDraft(JSON.stringify({
        ...fixture, items: [{ ...fixture.items[0], rotation: 90, position: { x: 0.01, y: 0.375, z: 3 } }],
      }));
      throw new Error('Expected draft validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(PhotoRoomInputError);
      expect((error as PhotoRoomInputError).detail).toMatch(/items\.0\.position: .*extends outside the room/);
    }
  });

  test('rejects cross-project links and URL source fields', () => {
    for (const link of [{ tag: 'DISPLAY-01' }, { deviceId: 'other-id' }]) {
      expect(() => readPhotoRoomDraft(JSON.stringify({ ...fixture, items: [{ ...fixture.items[0], ...link }] })))
        .toThrow('cannot link to devices');
    }
    expect(() => readPhotoRoomDraft(JSON.stringify({
      ...fixture, provenance: { ...fixture.provenance, sources: [{ label: 'Source', uri: 'https://example.org' }] },
    }))).toThrow('must not contain web links');
  });

  test('external prompt provides room-import JSON shape, honest estimates, and instructions for no actions', () => {
    const prompt = photoRoomPrompt({ axis: 'height', meters: 2.7 });
    expect(prompt).toContain('2.7 m exactly for room.height');
    expect(prompt).toContain('Do not call tools');
    expect(prompt).toContain('Do not include tag, deviceId, URLs, image data, or encoded photos');
    expect(prompt).toContain('"dimensionBasis": "estimated"');
    expect(photoRoomPrompt()).toContain('No room dimension was provided');
  });
});
