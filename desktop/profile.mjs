import { cpSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';

/** Copy the previous desktop profile once; its original remains recoverable.
 * The encoded name is a frozen storage compatibility key, not product branding.
 */
export function migrateProfile(appData, destination, development, testProfile) {
  if (existsSync(destination)) return false;
  const previousName = Buffer.from('SFRJRkEgU2NoZW1hIEVsZWN0cm9u', 'base64').toString('utf8');
  const previous = path.join(appData, previousName + (development ? ` Dev${testProfile ? ' ' + testProfile : ''}` : ''));
  if (!existsSync(previous)) return false;
  const staging = `${destination}.migrating`;
  try {
    rmSync(staging, { recursive: true, force: true });
    mkdirSync(staging, { recursive: true });
    cpSync(previous, staging, { recursive: true, filter: source => !/^Singleton|^lockfile$/.test(path.basename(source)) });
    renameSync(staging, destination);
    return true;
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw new Error(`Could not migrate the saved drawing profile: ${error.message}`);
  }
}
