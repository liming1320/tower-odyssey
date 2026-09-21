// netplay 房间列表接口单测：验证 filterRooms 的过滤 + 返回字段形状
// （对齐官方 EmulatorJS-Netplay 的 /list：按 game_id 过滤、返回房间对象表）。
// 纯函数测试，无需安装 socket.io。
const assert = require('assert');
const { filterRooms } = require('../server/netplay.js');

let pass = 0;
function ok(name, cond) {
    assert.ok(cond, 'FAIL: ' + name);
    pass++;
    console.log('  ✓ ' + name);
}

// 构造一份合成房间表（模拟两个玩家先后建房）
const rooms = {
    // 同 game_id、未满 → 应出现在列表
    'roomAAA': {
        owner: 'sock1',
        players: { u1: { socketId: 'sock1', player_name: 'Alice' } },
        roomName: 'Alice Room',
        gameId: '1001',
        password: null,
        maxPlayers: 4,
    },
    // 同 game_id、第二人加入（房间仍未满）→ 仍出现，current=2
    'roomBBB': {
        owner: 'sock2',
        players: {
            u2: { socketId: 'sock2', player_name: 'Bob' },
            u3: { socketId: 'sock3', player_name: 'Carol' },
        },
        roomName: 'Bob Room',
        gameId: '1001',
        password: 'secret',
        maxPlayers: 4,
    },
    // 不同 game_id → 不应出现（不同 ROM 串台防护）
    'roomCCC': {
        owner: 'sock4',
        players: { u4: { socketId: 'sock4', player_name: 'Dave' } },
        roomName: 'Dave Room',
        gameId: '9999',
        password: null,
        maxPlayers: 4,
    },
    // 已满 → 不应出现
    'roomFULL': {
        owner: 'sock5',
        players: { a: { socketId: 's5' }, b: { socketId: 's6' }, c: { socketId: 's7' }, d: { socketId: 's8' } },
        roomName: 'Full Room',
        gameId: '1001',
        password: null,
        maxPlayers: 4,
    },
};

console.log('filterRooms 测试：');
const list = filterRooms(rooms, '1001');
ok('只返回同 game_id 的房间', Object.keys(list).length === 2);
ok('包含 roomAAA', !!list['roomAAA']);
ok('包含 roomBBB', !!list['roomBBB']);
ok('不含不同 game_id 的 roomCCC', !list['roomCCC']);
ok('不含已满的 roomFULL', !list['roomFULL']);

ok('roomAAA 字段 room_name 正确', list['roomAAA'].room_name === 'Alice Room');
ok('roomAAA current=1', list['roomAAA'].current === 1);
ok('roomAAA max=4', list['roomAAA'].max === 4);
ok('roomAAA player_name=Alice（房主）', list['roomAAA'].player_name === 'Alice');
ok('roomAAA hasPassword=false', list['roomAAA'].hasPassword === false);

ok('roomBBB current=2', list['roomBBB'].current === 2);
ok('roomBBB player_name=Bob（房主 sock2）', list['roomBBB'].player_name === 'Bob');
ok('roomBBB hasPassword=true', list['roomBBB'].hasPassword === true);

// game_id 数字/字符串混比
const listNum = filterRooms(rooms, 1001);
ok('数字 game_id 也能匹配字符串存储', !!listNum['roomAAA'] && !!listNum['roomBBB']);

// 无房间时返回空对象
ok('空表返回 {} ', Object.keys(filterRooms({}, 'x')).length === 0);

console.log('\n全部通过：' + pass + ' 项断言');
