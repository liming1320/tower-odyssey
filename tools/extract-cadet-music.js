/* Extract original Full Tilt MIDS event streams into browser-friendly note data. */
'use strict';

const fs = require('fs');
const path = require('path');

const input = process.argv[2] || 'F:/BaiduNetdiskDownload/FullTilt/CADET/SOUND';
const output = process.argv[3] || path.join(__dirname, '..', 'public', 'data', 'pinball-cadet-music.json');

function readTrack(file) {
    const bytes = fs.readFileSync(file);
    if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'MIDS') {
        throw new Error(`${file} is not a RIFF MIDS file`);
    }
    const ticks = bytes.readUInt32LE(20);
    const flags = bytes.readUInt32LE(28);
    const blocks = bytes.readUInt32LE(40);
    const eventWords = flags === 0 ? 3 : 2;
    const events = [];
    let offset = 44;
    for (let block = 0; block < blocks; block++) {
        const start = bytes.readUInt32LE(offset);
        const size = bytes.readUInt32LE(offset + 4);
        const count = size / (4 * eventWords);
        offset += 8;
        let tick = start;
        for (let index = 0; index < count; index++) {
            tick += bytes.readUInt32LE(offset);
            const event = bytes.readUInt32LE(offset + (eventWords - 1) * 4);
            events.push([tick, event]);
            offset += eventWords * 4;
        }
    }
    events.sort((a, b) => a[0] - b[0]);

    const programs = Array(16).fill(0);
    const active = new Map();
    const notes = [];
    let tempo = 500000;
    let previousTick = 0;
    let seconds = 0;
    for (const [tick, event] of events) {
        seconds += (tick - previousTick) * tempo / (ticks * 1000000);
        previousTick = tick;
        const type = event >>> 24;
        if (type === 1) {
            tempo = event & 0x00ffffff;
            continue;
        }
        if (type !== 0) continue;
        const status = event & 0xff;
        const command = status & 0xf0;
        const channel = status & 0x0f;
        const note = (event >>> 8) & 0xff;
        const velocity = (event >>> 16) & 0xff;
        if (command === 0xc0) programs[channel] = note;
        if (command === 0x90 && velocity > 0) active.set(`${channel}:${note}`, [seconds, velocity, programs[channel]]);
        if (command === 0x80 || (command === 0x90 && velocity === 0)) {
            const key = `${channel}:${note}`;
            const begin = active.get(key);
            if (begin) {
                notes.push([Math.round(begin[0] * 1000), Math.max(25, Math.round((seconds - begin[0]) * 1000)), note, begin[1], channel, begin[2]]);
                active.delete(key);
            }
        }
    }
    for (const [key, begin] of active) {
        const [channel, note] = key.split(':').map(Number);
        notes.push([Math.round(begin[0] * 1000), 90, note, begin[1], channel, begin[2]]);
    }
    notes.sort((a, b) => a[0] - b[0]);
    return { duration: Math.ceil(seconds * 1000), notes };
}

const tracks = ['TABA1.MDS', 'TABA2.MDS', 'TABA3.MDS'].map(name => readTrack(path.join(input, name)));
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify({ source: 'Full Tilt Space Cadet MDS', tracks }));
for (const [index, track] of tracks.entries()) console.log(`TABA${index + 1}: ${track.notes.length} notes, ${(track.duration / 1000).toFixed(1)} seconds`);
