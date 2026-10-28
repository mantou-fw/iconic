import { productSchema, roomImportSchema } from '../shared/ai-imports.mjs';

const text = value => typeof value === 'string' && value.length <= 20000;
const number = value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1000000;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const optional = (value, check) => value === undefined || check(value);
const point = value => object(value) && number(value.x) && number(value.y);
const vector = keys => value => object(value) && keys.every(key => optional(value[key], number));
const array = check => value => Array.isArray(value) && value.length <= 500 && value.every(check);
const ports = array(value => object(value) && ['label', 'connector', 'signal'].every(key => optional(value[key], text)));
const roomKinds = ['tv','projector','screen','speaker','subwoofer','rack','camera','keypad','table','desk','sofa','chair','cabinet','rug','plant','door','window'];
const stringFields = (cmd, keys) => keys.every(key => optional(cmd[key], text));
export function validateActions(actions) {
  if (!Array.isArray(actions) || actions.length > 200) throw new Error('最多可套用 200 個畫布指令');
  for (const [index, cmd] of actions.entries()) {
    let valid = object(cmd) && text(cmd.type);
    if (valid) {
      valid = optional(cmd.position, point);
      switch (cmd.type) {
        case 'import_product': productSchema.parse(cmd); break;
        case 'import_room_layout': roomImportSchema.parse(cmd); break;
        case 'get_state': case 'get_room': case 'clear': case 'clear_room': case 'layout': break;
        case 'add_device': valid &&= stringFields(cmd, ['tag','name','manufacturer','model','zone']) && optional(cmd.inputs,ports) && optional(cmd.outputs,ports); break;
        case 'add_zone': valid &&= text(cmd.name) && optional(cmd.color,text) && ['width','height'].every(key => optional(cmd[key],value => number(value) && value > 0)); break;
        case 'add_text': case 'add_memo': valid &&= text(cmd.text); break;
        case 'connect': valid &&= text(cmd.from) && text(cmd.to) && stringFields(cmd,['fromPort','toPort','label']); break;
        case 'delete_device': valid &&= text(cmd.tag); break;
        case 'add_title_block': valid &&= optional(cmd.fields,value => object(value) && Object.values(value).every(text)); break;
        case 'add_rack': valid &&= stringFields(cmd,['tag','name']) && optional(cmd.units,value => number(value) && value >= 1 && value <= 100) && optional(cmd.equipment,array(value => object(value) && text(value.label) && stringFields(value,['tag','color']) && ['u','height'].every(key => optional(value[key],n => number(n) && n >= 1 && n <= 100)))); break;
        case 'set_room': valid &&= optional(cmd.name,text) && ['width','depth','height'].every(key => optional(cmd[key],value => number(value) && value > 0 && value <= 1000)) && optional(cmd.clearItems,value => typeof value === 'boolean'); break;
        case 'add_room_item':
          // Room positions allow optional z; schematic positions require x/y.
          valid = roomKinds.includes(cmd.kind) && text(cmd.label) && stringFields(cmd,['tag','color','note']) && optional(cmd.position,vector(['x','y','z'])) && optional(cmd.size,value => vector(['w','h','d'])(value) && Object.values(value).every(n => number(n) && n > 0)) && optional(cmd.rotation,number) && optional(cmd.mount,value => ['wall','ceiling','floor','table','rack'].includes(value));
          break;
        default: valid = false;
      }
    }
    if (!valid) throw new Error(`第 ${index + 1} 個畫布指令格式無效（${cmd?.type ?? 'unknown'}）`);
  }
  return actions;
}
