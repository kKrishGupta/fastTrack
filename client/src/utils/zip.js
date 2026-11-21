// A small ZIP writer for a fixed set of UTF-8 text files (uncompressed ZIP entries).
const encoder = new TextEncoder();
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function header(size, values) {
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  for (const [offset, length, value] of values) {
    if (length === 4) view.setUint32(offset, value, true);
    else view.setUint16(offset, value, true);
  }
  return bytes;
}
function concatenate(chunks) {
  const bytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
export function createTextZip(files) {
  if (files.length > 100) throw new Error('Too many archive entries');
  const local = [];
  const central = [];
  const names = new Set();
  let offset = 0;
  for (const { name, contents } of files) {
    if (!/^[\w.-]+$/.test(name) || name === '.' || name === '..' || names.has(name)) throw new Error('Invalid or duplicate archive filename');
    names.add(name);
    const filename = encoder.encode(name);
    const data = encoder.encode(contents);
    const crc = crc32(data);
    const entry = header(30, [[0,4,0x04034b50],[4,2,20],[6,2,0x800],[12,2,33],[14,4,crc],[18,4,data.length],[22,4,data.length],[26,2,filename.length]]);
    local.push(entry, filename, data);
    central.push(header(46, [[0,4,0x02014b50],[4,2,20],[6,2,20],[8,2,0x800],[14,2,33],[16,4,crc],[20,4,data.length],[24,4,data.length],[28,2,filename.length],[42,4,offset]]), filename);
    offset += entry.length + filename.length + data.length;
  }
  const directory = concatenate(central);
  return concatenate([...local, directory, header(22, [[0,4,0x06054b50],[8,2,files.length],[10,2,files.length],[12,4,directory.length],[16,4,offset]])]);
}
