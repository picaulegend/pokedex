import { writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

// One set of shapes supplies the vector icon and its small raster fallbacks.
const shapes = [
  { type: 'rect', x: 0, y: 0, width: 64, height: 64, rx: 14, fill: '#233a34' },
  { type: 'circle', cx: 32, cy: 32, r: 23, fill: '#e7ee70' },
  { type: 'path', d: 'M9 32a23 23 0 0 0 46 0Z', fill: '#f7f8f3' },
  { type: 'rect', x: 9, y: 30, width: 46, height: 4, fill: '#233a34' },
  { type: 'circle', cx: 32, cy: 32, r: 8, fill: '#233a34' },
  { type: 'circle', cx: 32, cy: 32, r: 4.5, fill: '#f7f8f3' },
];

export const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${shapes
  .map(
    ({ type, ...attrs }) =>
      `<${type} ${Object.entries(attrs)
        .map(([key, value]) => `${key}="${value}"`)
        .join(' ')}/>`,
  )
  .join('')}</svg>`;
export const iconDataUrl = `data:image/svg+xml,${encodeURIComponent(iconSvg)}`;

function contains(shape, x, y) {
  if (shape.type === 'circle') return Math.hypot(x - shape.cx, y - shape.cy) <= shape.r;
  // The path is the lower half of the outer circle.
  if (shape.type === 'path') return y >= 32 && contains(shapes[1], x, y);
  const radius = shape.rx || 0;
  return (
    Math.hypot(
      Math.max(Math.abs(x - shape.x - shape.width / 2) - shape.width / 2 + radius, 0),
      Math.max(Math.abs(y - shape.y - shape.height / 2) - shape.height / 2 + radius, 0),
    ) <= radius
  );
}

function chunk(type, data) {
  const payload = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of payload) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const header = Buffer.alloc(4),
    checksum = Buffer.alloc(4);
  header.writeUInt32BE(data.length);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([header, payload, checksum]);
}

function png(size, opaque = false) {
  const rows = Buffer.alloc((size * 4 + 1) * size);
  const colors = shapes.map(({ fill }) => [1, 3, 5].map((i) => parseInt(fill.slice(i, i + 2), 16)));
  // Four samples per axis keep the small circle edges smooth.
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const total = [0, 0, 0, 0];
      for (let sy = 0; sy < 4; sy++)
        for (let sx = 0; sx < 4; sx++) {
          const px = ((x + (sx + 0.5) / 4) * 64) / size;
          const py = ((y + (sy + 0.5) / 4) * 64) / size;
          let index = shapes.findLastIndex((shape) => contains(shape, px, py));
          if (index < 0 && opaque) index = 0;
          if (index < 0) continue;
          for (let c = 0; c < 3; c++) total[c] += colors[index][c];
          total[3]++;
        }
      const offset = y * (size * 4 + 1) + 1 + x * 4;
      for (let c = 0; c < 3; c++) rows[offset + c] = Math.round(total[c] / (total[3] || 1));
      rows[offset + 3] = Math.round((total[3] * 255) / 16);
    }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export async function writeAppIcons(directory) {
  await writeFile(`${directory}/favicon.svg`, iconSvg);
  for (const [name, size] of [
    ['apple-touch-icon.png', 180],
    ['icon-192.png', 192],
    ['icon-512.png', 512],
  ])
    await writeFile(`${directory}/${name}`, png(size, true));
  const images = [16, 32, 48].map((size) => ({ size, data: png(size) }));
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, index) => {
    const start = 6 + index * 16;
    header[start] = header[start + 1] = size;
    header.writeUInt16LE(1, start + 4);
    header.writeUInt16LE(32, start + 6);
    header.writeUInt32LE(data.length, start + 8);
    header.writeUInt32LE(offset, start + 12);
    offset += data.length;
  });
  await writeFile(
    `${directory}/favicon.ico`,
    Buffer.concat([header, ...images.map(({ data }) => data)]),
  );
}
