(function (global) {
  'use strict';

  var MAPS = [
    '03040404041204040404030304040404020404040403030404040400040404040303040404040004040404030304040404000404040403030404040400040404040303030404040004040403030303030303060303030303050305030072000305030505050505050105050505050505050505000505050505',
    '12021639383900000000000303030303030303030300200045060003201620030016453003000320162003000306030300030303400300164600030006523942030034001703000303030303000306030300000000000000004600030308030303060320211603180100031649172025160300110003161616',
    '11030065000330341618030103340321033034161703000316031603303416640300031603160303030306030003000300000006000003000306030306030306030300100000000003006400030003060303070309030903000316032120030003000302031603212003000300031203300321200374037503',
    '31381603131415030303033816000300000003004200164500030306030300030003060303004500031603380000000303030003160342390300423842000316033839030303030300000003000000000000030306030300030303034203380038030003000000000334421603021101030303033021160312',
    '00400003007300030040000603060300000003060306000300030309030300030000034503434443034503004203200334433403200342420320030308030320034238032003495649032003380003000330493003000300000300030307030300030002030003160016030003011203004000000040000311',
    '19032003215200005216170003300352000000005216430300034600030306030300065203354603004946754303000303030300000046300300000042450000000034030340030303030000000074034003000000495600030303420306030703060301000300034203340602031100420000000316031203',
    '23470334031641290321214716033003001641035121164407000744001603005100000356030000000350000303030803030303030603000053001616160053000000030303030303030303030003430643000000000003000306030603030303070300034303020003030001030000000312000606001103',
    '12020000000000000303030303004403070347000303030044340355033047000300000303030903030300000000075509280955070000000303030309030303030000032030035503342003000003162003070320160300000303171721171703030000000303030803030300000300000611010006000003',
    '11030000000003001647000103000303060306030300000300030000070000033000030003600303034303404303000320031202000340440334032003030303030043034003000000030044000003400303035603060303000300470003470300000000030303060300030303000000600000030041554100',
    '27160003030300000003001600500600000003000647030603030003030300031600000003000301000003160000000800031103000320030703030003030300030334613003600312030003200306030300000206000316472047030307030300031617472003516051030006473217470621512103000300',
    '00030334500350300303000000030306030603030051000000000003000000512100030003030303030003034303000016161600000316440300030303030603031643030009011103000644000003030303030306030300000320343003004400031602032034300860036003161203203430031703170320',
    '20031603170318032136212003160317031803565656200316031703180300560006030603060306030307030000000000030000000000060303070303030703030634030057216221570003303403500303030303500330340350031314150350033003030803200020030803031101000000000000000212',
    '75340300646564000321263000030003060300030021000003000365030003000000620300031603000366006259030003160300035466030703000320030003070300000000032003000000000303030003030300030303346206575758575706623003030303030703030303031202000000000000000111',
    '00620000000000030059000003030303030603000300000300005700000300030021030803030300030003006403000059035703300300650300480903580330030064035909740357033003340003030303030003000334006400030000005900033403030003210303030303001101000702120324480600',
    '03006619120200000000030300210303030303210003030003030303030303000303000303032203030300030300030303090303030003030020030359030320000303000404034803040400030300040403590304040003030004040307030404000303575857070107575857030303030303110303030303',
    '00000001110412020000000004040404040404040400000404030303030304040000040303740375030304000004030334033403030400000403033003300303040000040403000300030404000004040306030603040400000404040000000404040000040404040804040404000000000000000000000000',
    '04040404040111040404040404040404000404040404040404040400040404040404040404030803040404040404040303000303040404040404030367030304040404040403030203030404040404040303120303040404040404040303030404040404040404040404040404040404040404040404040404',
    '04664800000000000000660448040404040404040400040004660000000000006604000400040404040404040400040004660000006604040004660000040404000404000404040404660066040448040404110400040404046648006301046600006604040404040404040404001202630000000000000066',
    '04040404040404040404040404040404040404040404040404040404040404040404040404030303040404040404040303710303040404040404030309030304040404040403030803030404040404040403080304040404040404040404040404040404040404040404040404041101000000000000000000',
    '00000000000000000000000004000404040404000400000400040404040400040000040004041204040004000004000404020404000400000468040400040468040000040904046904040904000004330404000404370400000404040400040404040000040404040004040404000000000000000000000111',
    '63305520481848205530632104160417041704160421043455006600660055340420041604001100041604204817660000010000661748180400040004000400041848176600000200006617482004160400120004160420043455006600660055340421041604170417041604216330552048184820553063',
    '04040404040404040404040404007104700473000404040000040454040400000404000000045404000000040404000000000000000404040400000001000000040404040400000400000404040404040410111004040404040404040404040404040404040404040404040404040404040404040404040404'
  ];
var TOWER2_MAPS = ["00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000","17070101010000000000000001010000000101010101000000000001010000000000000001010100000000010000000000000000000101010101010100000000000000000001010101151502160000000017000000000015151515150216000000000000000000000115151515021600000001000001000001","17070101010101000001010101010100000101010101010000000005050505000000000004040303000017000505050500000000000101010100000000000505000000000000010101010101000000000001000000000001010101010101000000010101000000010101010101010101000101010101000101","17070000000000000001010101010101010101010101010000000101000000000000000001010101000002161602000000010101010105010500000217170200000006010601010505050000021616020000000606060105050505050001010101000006060606060101010000000101010101010000000101"];
  var TOWER3_MAPS = ["17070101010100000001010101011602000001010111110000000001010100160200000101111111000000000016020016020000001111110000000000171602000001000000111100000001010000160200010101000011110000010101010100010101010101000111110101010101010101010101010101","17070101010606060000000000000001000000010106060600000000000000160200000001060606000000000017000016020000000606060600000000000000001602020202060600000000000000000000161616161600000000000000000101010101010000000101000000010101010101010101010000","17071101010101010101010101010101010100111111111111010100010100000000000011111111111100000000000000000000000101010101000000170000000001010101000000000216000000000016020000000000000000021601000000011602000000000100000002160100000001160200000001"];
  var TOWER4_MAPS = ["000025000013000002000001000001000000000020000012000002000001000001000000000030000015000003000001000002000000000335000180000085000014000016000000000370000110000035000012000014000000000470000215000120000017000020000000000535000220000140000019000021000000000000000000000000000000000000000000000045000015000005000002000003000000000050000020000005000004000004000000000600000245000095000020000023000000000700000260000135000023000026000000000770000250000160000025000027001600001400000945000735000040000043000800001500001080000770000049000058000000000000000000000000000000000000000000000070000030000010000005000005000000000090000035000012000006000008000000000335000335000050000001000033000000000770000270000150000022000024000800000835000320000200000026000029001600001000000360000200000027000031000000001170000805000470000035000038000000001270000885000670000038000041000000001335000720000470000034000036000000","000000000000000000000000000000000000000170000040000012000008000010000000000250000060000010000010000011001600000335000085000070000011000013000000001100000375000210000028000032000000001135001090000600000047000054001600000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000435000200000120000015000018012800001135000800000400000030000035013600001270000450000270000029000033014400000000000000000000000000000000000000001000001350000670000045000051019200001500001500000850000061000070013600001670001570000670000065000074014400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000","000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001600001385000935000057000067000000001670001035000770000042000046000000002100001350000770000055000064000000003000002170001170000069000077000000003300001280000935000052000061000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000150000035000015000006000007000000000220000050000030000011000013000000001200001050000700000032000037000000000430000280000110000015000018000000000650000350000220000020000026000000","000000000000000000000000000000000000010000002800001600000112000134204800000000000000000000000000000000000000020000002800001600000000000000000404000000000000000000000000000000000000020000001600002800000000000000000404000000000000000000000000000000000000020000002800001600000000000000000304000000000000000000000000000000000000020000001600002800000000000000000304000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000999999999999999999000000000000205520999999999999999999000000000000205520999999999999999999000000000000205520999999999999999999000000000000205520999999999999999999000000000000205520999999999999999999000000000000205520","000070000015000002000002000002000000000000000000000000000000000000000000000000000000000000000000000000000000000050000020000001000001000001000000000000000000000000000000000000000000000000000000000000000000000000000000000200000035000010000004000005000000000700000250000125000024000027000000000100000020000005000003000003000000000150000065000030000007000009000000000550000160000090000016000021000000000050000020000002000001000002000000000250000070000040000007000009000000000450000085000055000008000011000000000240000130000060000010000013000000001500000700000550000044000055000000000000000000000000000000000000000000000110000025000005000004000005000000000400000090000050000010000013000000000000000000000000000000000000000000000000000000000000000000000000000000000150000040000020000005000007000000002300001200001100000080000094000000002500000900000850000060000070000000000000000000000000000000000000000000","000000000000000000000000000000000000000300000075000045000008000011000000000000000000000000000000000000000000000000000000000000000000000000000000000900000450000330000040000042000000000000000000000000000000000000000000000000000000000000000000000000000000000500000115000065000012000013025600000000000000000000000000000000000000002100001150001050000064000077000000000000000000000000000000000000000000000100000200000110000020000025000000000125000050000025000006000009000000000000000000000000000000000000000000000000000000000000000000000000000000000500000400000260000036000040006400003000002210001950000093000110000800001500000830000730000056000067001600000250000120000070000014000017012800002000001100000970000075000089020800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001300000300000150000028000034012900000000000000000000000000000000000000","000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001250000500000400000044000046000000000000000000000000000000000000000000000450000150000090000016000019000000001500000560000460000048000050000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002000000680000590000052000059000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001200000620000520000052000063000000000900000750000650000056000065000000002400002612002400000100000122000000000000000000000000000000000000000000000850000350000200000032000038000000001500001300001200000080000098000000","001200000980000900000060000074000000010000001000001000000080000084000000013000001300001300000104000109000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000030000003400003000000275000325000000000000000000000000000000000000000000015000001700001500000176000209000000025000002550002250000220000260000000099999009999005000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000999999999999999999000000000000205520999999999999999999000000000000205520999999999999999999000000000000205520999999999999999999000000000000205520999999999999999999000000000000205520999999999999999999000000000000205520"];
  var WIDTH = 11;
  var HEIGHT = 11;
  var SAVE_KEY = 'pk32-tower-save-v1';
  var WALLS = { '03': 1, '04': 1, '40': 1, '66': 1 };
  var COLORS = { floor: '#f4ead0', wall: '#39434f', door: '#a64b37', key: '#e3b341', enemy: '#713c74', exit: '#2d8c72', player: '#2374a8' };
  var TILE_NAMES = { '00': '地板', '01': '主角', '02': '地板', '03': '墙', '04': '墙', '05': '地板', '06': '地板', '07': '地板', '08': '地板', '09': '地板', '10': '地板', '11': '主角', '12': '红门', '16': '蓝门', '17': '黄门', '18': '绿门', '20': '红钥匙', '21': '蓝钥匙', '22': '黄钥匙', '23': '绿钥匙', '72': '出口' };
  function tileName(code) { return TILE_NAMES[code] || (code.length === 1 ? '未识别资源' : (isTreasure(code) ? '道具' : isEnemy(code) ? '怪物' : '地板')); }
  function tileKind(code) {
    if (code.length === 1) return code === '9' ? 'wall' : 'floor';
    if (isWall(code) || code === '9') return 'wall';
    if (isDoor(code)) return 'door';
    if (isKey(code)) return 'key';
    if (isTreasure(code)) return 'treasure';
    if (code === '72') return 'exit';
    if (code === '01' || code === '11') return 'player';
    if (isEnemy(code)) return 'enemy';
    return 'floor';
  }
  function tileGlyph(code) {
    var kind = tileKind(code);
    return kind === 'wall' ? '' : kind === 'door' ? '门' : kind === 'key' ? '钥' : kind === 'treasure' ? '宝' : kind === 'exit' ? '梯' : kind === 'player' ? '主' : kind === 'enemy' ? '怪' : '';
  }
  // Native RVA 0x1729e20: PicForm(22), 18 columns, paired 33px rows, 32px SRCCOPY.
  var ORIGINAL_ART = '/img/pk32/original/sheet-915611.png';
  var ORIGINAL_NAMES = { '00': '地板', '01': '下层入口', '02': '上层入口', '03': '砖墙', '04': '星空', '05': '熔岩', '06': '黄门', '07': '蓝门', '08': '红门', '09': '铁门', '10': '机关门', '11': '下楼梯', '12': '上楼梯', '16': '黄钥匙', '17': '蓝钥匙', '18': '红钥匙', '71': '公主', '72': '仙子', '73': '杰克', '74': '老人', '75': '商人' };
  var ORIGINAL_DOORS = { '06': 'yellow', '07': 'blue', '08': 'red' };
  var ORIGINAL_KEYS = { '16': 'yellow', '17': 'blue', '18': 'red' };
  // Native opening call sequence at RVA 0x174bcc4..0x174bd80.
  var OPENING_STORY = [
    '这是一个很古老的故事，传说在很久很久以前，在遥远的西方大地上，有着这样一个王国，王国虽小，但全国的人们都生活得非常幸福和快乐。',
    '突然有一天，从天空中飞来了一群可怕的怪物，它们来到皇宫，抢走了国王唯一的女儿。第二天，国王就向全国下达了紧急令，只要谁能将公主给找回来，他将会把王位让给他。',
    '于是，全国的勇士们都出发了。他们的足迹走遍了全国的各个角落，可是一点线索都没有找到，时间很快就过去了一个月。',
    '终于，在第三十一天，一个从远方归来的人告诉国王，说在海边的一座小岛上，曾看到一群怪物出现过。勇士们又出发了，可是，大部分人都没有回来，能活着回来的，都再也不敢去了。',
    '而我们的故事，就是从这里开始的……'
  ];
  // Native fairy dialogue call sequence at RVA 0x1732727..0x1732a46.
  var FAIRY_INTRO = [
    '勇士：……',
    '仙子：你醒了。',
    '勇士：你是谁？我在哪里？',
    '仙子：我是这里的仙子，刚才你被这里的小怪打晕了。',
    '勇士：剑、剑、我的剑呢？',
    '仙子：你的剑被它们抢走了，我只来的及把你救出来。',
    '勇士：那，公主呢？我是来救公主的。',
    '仙子：公主还在里面，你这样进去是打不过里面的小怪的。',
    '勇士：那我现在应该怎么办呢？我答应了国王一定要把公主救出来的。',
    '仙子：放心吧，我把我的力量借给你，你就可以打赢那些小怪了，不过，你要先帮我找一样东西，找到了再来这里找我。',
    '勇士：找东西？找什么东西？',
    '仙子：是一个十字架，中间有一颗红色的宝石。',
    '勇士：那个东西有什么用吗？',
    '仙子：我本来是这座塔的守护者，可不久前，从北方来了一批恶魔，它们占领了这座塔，并将我的魔力封在了这个十字架里面，如果你能将它带出塔来，那我的魔力就会慢慢地恢复，到那时我就可以把力量借给你去救公主了。',
    '勇士：好吧，我试试看。',
    '仙子：刚才我去看过了，你的剑被放在三楼，你的盾在五楼上，而那个十字架被放在七楼。要到七楼，你要先取回你的剑和盾。另外，在塔里的其它楼层上，还有一些存放了几百年的宝物，如果得到它们，对于你对付里面的怪物有很大的帮助。',
    '勇士：可是，我怎么进去呢？',
    '仙子：我这里有三把钥匙，你先进去，在塔里面还有很多这样的钥匙，你一定要珍惜使用。勇敢地去吧，勇士。'
  ];
  // Native first Jack conversation at RVA 0x17336d5..0x173387c.
  var JACK_INTRO = [
    '勇士：你已经得救了。',
    '杰克：啊，那真是太好了，我又可以在这里面寻宝了。哦，还没有自我介绍，我叫杰克，是这附近有名的寻宝猎人，什么金银财宝我样样都得到过。不过这次运气可不是太好，刚进来就被抓了，现在你帮我打开了门，那我就帮你做一件事吧。',
    '勇士：快走吧，外面还有很多的怪物，我可能顾不上你。',
    '杰克：不，不，不会有事的。快说吧，叫我做什么？',
    '勇士：你会开门吗？',
    '杰克：那当然。',
    '勇士：那就请你帮我打开第二层的门吧。',
    '杰克：那个简单，不过，如果你能帮我找到一把嵌了红宝石的铁榔头的话，我还帮你打通第十八层的路。',
    '勇士：嵌了红宝石的铁榔头？好吧，我帮你找找。',
    '杰克：非常地感谢。一会我便会将第二层的门打开。如果你找到那个铁榔头的话，还是来这里找我。'
  ];
  var ELDER_SWORD = [
    '勇士：您已经得救了。',
    '神秘老人：哦，我的孩子，真是太感谢你了。这个地方又脏又坏，我真的是快呆不下去了。',
    '勇士：快走吧，我还要去救被关在这里的公主。',
    '神秘老人：哦，原来你是来救公主的，为了表示对你的感谢，这个东西就送给你吧，这还是我年轻的时候用过的。拿着它去解救公主吧。',
    '得到<青锋剑>：攻击 + 70'
  ];
  // Native floor-two merchant gift at RVA 0x1734da0..0x1734e77.
  var MERCHANT_SHIELD = [
    '勇士：您已经得救了。',
    '商人：哦，是嘛。真是太感谢你了。我是个商人，不知道为什么被抓到这里来了。',
    '勇士：快走吧，现在您已经自由了。',
    '商人：哦，对对对，我已经自由了。那这个东西就给你吧，本来我是准备卖钱的。相信它对你一定很有帮助。',
    '得到<黄金盾>：防御 + 85'
  ];
  // Native item cases 0x172e454..0x173085d; fixed bonuses, independent of floor.
  var ORIGINAL_ITEMS = {
    '19': { name: '钥匙盒', keys: 1 }, '20': { name: '小血瓶', hp: 200 },
    '21': { name: '大血瓶', hp: 500 }, '22': { name: '圣水瓶', doubleHp: true },
    '23': { name: '小飞羽', level: 1, hp: 1000, attack: 7, defense: 7 },
    '24': { name: '大飞羽', level: 3, hp: 3000, attack: 21, defense: 21 },
    '25': { name: '圣光徽', inventory: 'book' }, '26': { name: '星光神榔', inventory: 'hammer' },
    '27': { name: '风之罗盘', inventory: 'compass' }, '28': { name: '幸运十字架', inventory: 'cross' },
    '29': { name: '大金币', gold: 300 }, '30': { name: '红宝石', attack: 3 },
    '31': { name: '铁剑', attack: 10, equipment: 'sword' }, '32': { name: '钢剑', attack: 40, equipment: 'sword' },
    '33': { name: '星光神剑', attack: 150, equipment: 'sword' }, '34': { name: '蓝宝石', defense: 3 },
    '35': { name: '铁盾', defense: 10, equipment: 'shield' }, '36': { name: '钢盾', defense: 30, equipment: 'shield' },
    '37': { name: '光芒神盾', defense: 190, equipment: 'shield' }
  };
  function originalPickup(state, code) {
    var item = ORIGINAL_ITEMS[code]; if (!item) return false;
    ['hp', 'attack', 'defense', 'gold', 'level'].forEach(function (key) { if (item[key]) state[key] = (state[key] || 0) + item[key]; });
    if (item.doubleHp) state.hp *= 2;
    if (item.keys) ['red', 'blue', 'yellow'].forEach(function (key) { state.keys[key] += item.keys; });
    if (item.inventory) { state.inventory = state.inventory || {}; state.inventory[item.inventory] = true; }
    if (item.equipment) {
      state.inventory = state.inventory || {};
      state.inventory[item.equipment] = Math.max(Number(state.inventory[item.equipment]) || 0, Number(code)).toString();
    }
    return true;
  }
  // Native shop branches 0x1745049..0x174590c: fixed prices, not escalating purchases.
  function originalShopOffers(layer, kind) {
    if (kind === 'experience') {
      if (layer !== 5 && layer !== 13) return [];
      var advanced = layer === 13;
      return [
        { stat: 'level', amount: advanced ? 3 : 1, cost: advanced ? 270 : 100, currency: 'experience', hp: advanced ? 3000 : 1000, attack: advanced ? 21 : 7, defense: advanced ? 21 : 7 },
        { stat: 'attack', amount: advanced ? 17 : 5, cost: advanced ? 95 : 30, currency: 'experience' },
        { stat: 'defense', amount: advanced ? 17 : 5, cost: advanced ? 95 : 30, currency: 'experience' }
      ];
    }
    if (layer !== 3 && layer !== 11) return [];
    var high = layer === 11;
    return [
      { stat: 'hp', amount: high ? 4000 : 800, cost: high ? 100 : 25 },
      { stat: 'attack', amount: high ? 20 : 4, cost: high ? 100 : 25 },
      { stat: 'defense', amount: high ? 20 : 4, cost: high ? 100 : 25 }
    ];
  }
  function equipmentCode(state, slot) {
    var code = state.inventory && state.inventory[slot];
    if (ORIGINAL_ITEMS[code] && ORIGINAL_ITEMS[code].equipment === slot) return String(code);
    code = null;
    // Older saves recorded collected cells, but did not record equipment slots.
    Object.keys(state.cleared || {}).forEach(function (token) {
      if (!state.cleared[token]) return;
      var parts = token.split(':'), layer = LAYERS[Number(parts[0])];
      var candidate = layer && layer.cells[Number(parts[1])], item = ORIGINAL_ITEMS[candidate];
      if (item && item.equipment === slot && (!code || Number(candidate) > Number(code))) code = candidate;
    });
    return code || null;
  }
  // Native RVA 0x172b1fe: HP, attack, defense, gold, experience for map codes 38..70.
  var ORIGINAL_MONSTERS = [
    [70,15,2,2,1],[50,20,1,1,1],[200,35,10,5,3],[700,250,125,32,25],
    [100,20,5,3,2],[150,65,30,10,8],[550,170,100,25,20],[110,25,5,5,3],
    [150,40,20,8,5],[400,90,50,15,12],[2500,900,850,84,70],[300,75,45,13,10],
    [900,450,330,50,40],[500,115,65,15,15],[125,50,25,10,7],[100,200,110,30,25],
    [1500,830,730,80,65],[1300,300,150,40,30],[450,150,90,22,19],[1250,500,400,55,45],
    [1500,560,460,60,50],[2000,680,590,70,55],[250,120,70,20,15],[500,400,260,47,35],
    [1200,620,520,65,50],[3100,1050,950,92,80],[850,350,200,45,35],[900,750,650,77,60],
    [1200,980,900,88,75],[15000,1000,1000,100,100],[20000,1333,1333,100,100],
    [25000,1500,1200,150,120],[37500,2250,1800,150,120]
  ];
  function originalBattle(hero, code, percent) {
    var monster = ORIGINAL_MONSTERS[Number(code) - 38];
    if (!monster) return null;
    var bossException = Number(code) === 70 && hero.layer === 21;
    var baseStrike = hero.attack - monster[2];
    // Native admission check uses base stats, while damage uses the scaled stats.
    if (!bossException && baseStrike <= 0) return { allowed: false, reason: '攻击不足，无法战斗' };
    if (!bossException && Math.ceil(monster[0] / baseStrike) * Math.max(0, monster[1] - hero.defense) > hero.hp) return { allowed: false, reason: '生命不足，无法战斗' };
    percent = Math.min(110, Math.max(100, percent || 100));
    var strike = Math.max(0, hero.attack - Math.max(1, Math.floor(monster[2] * percent / 100)));
    var counter = Math.max(0, Math.max(1, Math.floor(monster[1] * percent / 100)) - hero.defense);
    var hp = hero.hp, enemyHp = monster[0], rounds = 0;
    if (strike > 0) {
      rounds = Math.ceil(enemyHp / strike);
      if (counter > 0) rounds = Math.min(rounds, Math.ceil(hp / counter));
      hp = Math.max(0, hp - rounds * counter); enemyHp = Math.max(0, enemyHp - rounds * strike);
    } else if (counter > 0) { rounds = Math.ceil(hp / counter); hp = 0; }
    else {
      // Native RVA 0x1756d1d: both sides lose a decimal-sized amount in a stalemate.
      while (hp > 0 && enemyHp > 0) {
        var amount = 1;
        [10, 100, 1000, 10000].forEach(function (n) { if (hp >= n && enemyHp >= n) amount = n; });
        hp = Math.max(0, hp - amount); enemyHp = Math.max(0, enemyHp - amount); rounds++;
      }
    }
    var won = hp > 0;
    if (won) {
      if (Number(code) === 54) hp = Math.floor(hp * 3 / 4);
      if (Number(code) === 55) hp = Math.floor(hp * 2 / 3);
      if (Number(code) === 60) hp -= 100;
      if (Number(code) === 61) hp -= 300;
      hp = Math.max(1, hp);
    }
    return { allowed: true, hp: hp, enemyHp: enemyHp, rounds: rounds, damage: hero.hp - hp, gold: won ? monster[3] : 0, experience: won ? monster[4] : 0, won: won };
  }
  function originalKind(code) {
    var n = Number(code);
    if (n >= 3 && n <= 5) return 'wall';
    if (ORIGINAL_DOORS[code] || code === '09' || code === '10') return 'door';
    if (ORIGINAL_KEYS[code]) return 'key';
    if (n === 11 || n === 12) return 'exit';
    if (n >= 38 && n <= 70) return 'enemy';
    if (n >= 19 && n <= 37) return 'treasure';
    if (n >= 71 && n <= 75 || n >= 13 && n <= 15) return 'npc';
    return 'floor';
  }
  function isOriginalNpc(code) {
    var n = Number(code);
    return (n >= 71 && n <= 75) || (n >= 13 && n <= 15);
  }
  function tileSprite(code, frame) {
    var n = Number(code);
    if (!Number.isInteger(n) || n < 0 || n > 83) return null;
    return { x: (n % 18) * 33, y: Math.floor(n / 18) * 66 + (frame === 1 ? 33 : 0), width: 32, height: 32 };
  }
  function paintSprite(button, code) {
    var sprite = tileSprite(code, 0);
    if (!sprite) return;
    button.textContent = '';
    button.dataset.spriteCode = code;
    button.style.backgroundImage = 'url("' + ORIGINAL_ART + '")';
    button.style.backgroundSize = (593 / 32 * 100) + '% ' + (1038 / 32 * 100) + '%';
    button.style.backgroundPosition = (sprite.x / (593 - 32) * 100) + '% ' + (sprite.y / (1038 - 32) * 100) + '%';
  }

  function codeAt(map, x, y) { return map.slice((y * WIDTH + x) * 2, (y * WIDTH + x + 1) * 2); }
  function isWall(code) { return !!WALLS[code] || code === '9'; }
  function isDoor(code) { return code === '12' || code === '16' || code === '17' || code === '18'; }
  function isKey(code) { return code === '20' || code === '21' || code === '22' || code === '23'; }
  function isTreasure(code) { return parseInt(code, 10) >= 24 && parseInt(code, 10) < 30; }
  function isEnemy(code) { var n = parseInt(code, 10); return code.length > 1 && n >= 30 && n < 90 && code !== '40' && code !== '66'; }
  function makeLayer(map, index, width, height, unit, original) {
    width = width || WIDTH; height = height || HEIGHT; unit = unit || 2;
    var cells = [];
    for (var i = 0; i < width * height; i += 1) cells.push(map.slice(i * unit, i * unit + unit));
    var start = cells.indexOf(original ? '01' : '11');
    if (start < 0) start = cells.indexOf('01');
    if (start < 0 && unit === 1) start = width * (height - 2) + 1;
    if (start < 0) start = width * (height - 2) + 1;
    return { index: index, cells: cells, start: { x: start % width, y: Math.floor(start / width) } };
  }
  var LAYERS = MAPS.map(function (map, index) { return makeLayer(map, index, 11, 11, 2, true); });
  function buildSet(name, maps, width, height, unit) {
    return { name: name, maps: maps, width: width, height: height, unit: unit, layers: maps.map(function (map, index) { return makeLayer(map, index, width, height, unit, name === '魔塔'); }) };
  }
  var TOWER_SETS = {
    '魔塔': buildSet('魔塔', MAPS, 11, 11, 2),
    '魔塔二': buildSet('魔塔二', TOWER2_MAPS, 11, 11, 2),
    '魔塔三': buildSet('魔塔三', TOWER3_MAPS, 11, 11, 2),
    '魔塔四': buildSet('魔塔四', TOWER4_MAPS, 30, 30, 1)
  };

  function cloneState(setName, layerIndex) {
    var set = TOWER_SETS[setName] || TOWER_SETS['魔塔'], layer = set.layers[layerIndex];
    var visited = {}; visited[layerIndex] = true;
    return { set: set.name, layer: layerIndex, x: layer.start.x, y: layer.start.y, hp: setName === '魔塔' ? 1000 : 100, attack: 10, defense: setName === '魔塔' ? 10 : 5, gold: 0, experience: 0, level: 1, inventory: {}, keys: { red: 0, blue: 0, yellow: 0, green: 0 }, defeated: {}, cleared: {}, visited: visited, npcFlags: {}, gateFlags: {}, won: false, lost: false, ending: null };
  }
  function Tower(container, opts) {
    opts = opts || {};
    this.container = container;
    this.setName = TOWER_SETS[opts.set] ? opts.set : '魔塔';
    this.set = TOWER_SETS[this.setName];
    this.layers = this.set.layers;
    this.width = this.set.width;
    this.height = this.set.height;
    this.state = cloneState(this.setName, Math.max(0, Math.min(this.layers.length - 1, Number(opts.layer) || 0)));
    this.state.npcFlags.openingStory = true;
    this.state.dialog = null;
    this.moveQueue = [];
    this.handlers = [];
    this.render();
    if (this.setName === '魔塔' && !this.state.npcFlags.openingShown) {
      this.state.npcFlags.openingShown = true;
      this.showDialog(OPENING_STORY);
    }
  }
  Tower.prototype.getState = function () { return JSON.parse(JSON.stringify(this.state)); };
  Tower.prototype.cellCode = function (index) {
    var code = this.layers[this.state.layer].cells[index];
    // Native RVA 0x1732a56/0x1732a76: the fairy steps left after the first conversation.
    if (this.setName === '魔塔' && this.state.layer === 0 && this.state.npcFlags.fairyKeysReceived) {
      if (index === 92) code = '72';
      if (index === 93) code = '00';
    }
    return code;
  };
  Tower.prototype.floorLabel = function (layer) { return this.setName === '魔塔' && layer === 0 ? '序章' : '第' + (this.setName === '魔塔' ? layer : layer + 1) + '层'; };
  Tower.prototype.on = function (el, type, fn) { el.addEventListener(type, fn); this.handlers.push([el, type, fn]); };
  Tower.prototype.save = function () { try { if (this.state.battle && this.state.battle.animating) { this.state.battle.shown = this.state.battle.rounds; this.state.battle.animating = false; } localStorage.setItem(this.setName === '魔塔' ? SAVE_KEY + '-picform22' : SAVE_KEY, JSON.stringify(this.state)); this.render(); this.note('已保存当前楼层和状态'); } catch (e) { this.note('存档不可用'); } };
  Tower.prototype.load = function () { try { var s = JSON.parse(localStorage.getItem(this.setName === '魔塔' ? SAVE_KEY + '-picform22' : SAVE_KEY)); var set = TOWER_SETS[s && s.set] || TOWER_SETS['魔塔']; if (!s || s.layer < 0 || s.layer >= set.layers.length || s.x < 0 || s.x >= set.width || s.y < 0 || s.y >= set.height || !s.keys || typeof s.keys.red !== 'number' || typeof s.keys.blue !== 'number' || typeof s.keys.yellow !== 'number' || typeof s.keys.green !== 'number' || !s.defeated || typeof s.defeated !== 'object' || !Number.isFinite(s.hp) || !Number.isFinite(s.attack) || !Number.isFinite(s.defense) || !Number.isFinite(s.gold) || typeof s.won !== 'boolean' || typeof s.lost !== 'boolean') throw new Error('invalid save'); s.visited = s.visited && typeof s.visited === 'object' ? s.visited : {}; s.visited[s.layer] = true; s.npcFlags = s.npcFlags && typeof s.npcFlags === 'object' ? s.npcFlags : {}; s.gateFlags = s.gateFlags && typeof s.gateFlags === 'object' ? s.gateFlags : {}; s.dialog = typeof s.dialog === 'string' ? s.dialog : null; this.setName = set.name; this.set = set; this.layers = set.layers; this.width = set.width; this.height = set.height; this.state = s; this.render(); this.note('已读取存档'); } catch (e) { this.note('存档无效或不可用'); } };
  Tower.prototype.restart = function () { if (this.battleTimer) { global.clearTimeout(this.battleTimer); this.battleTimer = null; } this.moveQueue = []; this.state = cloneState(this.setName, this.setName === '魔塔' ? 0 : this.state.layer); this.render(); if (this.setName === '魔塔') { this.state.npcFlags.openingShown = true; this.showDialog(OPENING_STORY); } };
  Tower.prototype.note = function (message) { var el = this.container.querySelector('[data-role=message]'); if (el) el.textContent = message; };
  Tower.prototype.openIronDoor = function (index) {
    this.state.door = { layer: this.state.layer, index: index, step: 0 };
    this.render();
    this.container.focus({ preventScroll: true });
  };
  Tower.prototype.advanceDoor = function () {
    var door = this.state.door;
    if (!door || door.layer !== this.state.layer) return;
    door.step += 1;
    if (door.step >= 8) {
      this.state.cleared[door.layer + ':' + door.index] = true;
      this.state.door = null;
    }
    this.render();
    this.container.focus({ preventScroll: true });
  };
  Tower.prototype.openShop = function (kind) {
    if (!originalShopOffers(this.state.layer, kind).length) return;
    this.state.dialogMove = null;
    this.state.dialogAnchor = null;
    this.state.shop = { layer: this.state.layer, selected: 0, kind: kind || 'gold' };
    this.render();
  };
  Tower.prototype.closeShop = function () {
    this.state.shop = null;
    this.render();
    this.container.focus({ preventScroll: true });
  };
  Tower.prototype.buyShop = function (index) {
    var shop = this.state.shop;
    if (!shop || shop.layer !== this.state.layer || this.state.won || this.state.lost) return false;
    var offer = originalShopOffers(shop.layer, shop.kind)[index], currency = offer && offer.currency || 'gold';
    if (!offer || !Number.isFinite(this.state[currency]) || this.state[currency] < offer.cost) return false;
    this.state[currency] -= offer.cost;
    this.state[offer.stat] += offer.amount;
    ['hp', 'attack', 'defense'].forEach(function (stat) { if (offer[stat]) this.state[stat] += offer[stat]; }, this);
    shop.selected = index;
    this.render();
    return true;
  };
  Tower.prototype.renderShop = function (scene) {
    var self = this, shop = this.state.shop;
    if (!shop || shop.layer !== this.state.layer) return;
    var offers = originalShopOffers(shop.layer, shop.kind), experience = shop.kind === 'experience', high = experience ? shop.layer === 13 : shop.layer === 11;
    if (!offers.length) return;
    var panel = document.createElement('div');
    panel.dataset.role = 'shop'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', experience ? '神秘老人' : '神秘商店');
    panel.style.cssText = 'position:absolute;z-index:4;top:4px;left:50%;transform:translateX(-50%);width:240px;max-width:calc(100% - 8px);max-height:calc(100% - 8px);overflow:auto;box-sizing:border-box;padding:8px;background:#000;color:white;border:1px solid #fff';
    function art(x, y, width, height, scale) {
      var span = document.createElement('span');
      span.setAttribute('aria-hidden', 'true');
      span.style.cssText = 'display:block;flex-shrink:0;image-rendering:pixelated;background-image:url("' + ORIGINAL_ART + '");background-repeat:no-repeat;width:' + width * scale + 'px;height:' + height * scale + 'px;background-size:' + 593 * scale + 'px ' + 1038 * scale + 'px;background-position:-' + x * scale + 'px -' + y * scale + 'px';
      return span;
    }
    var header = art(experience ? 0 : 386, 334, 192, 48, 1);
    header.style.position = 'relative'; header.style.margin = '0 auto 4px';
    var price = art(480 + (high ? 21 : 0), 321, 20, 10, 1);
    price.style.position = 'absolute'; price.style.left = '98px'; price.style.top = '20px';
    if (!experience) header.appendChild(price); panel.appendChild(header);
    offers.forEach(function (offer, index) {
      var button = document.createElement('button'); button.type = 'button'; button.dataset.shopBuy = index;
      var name = { hp: '生命', attack: '攻击', defense: '防御', level: '等级' }[offer.stat];
      button.setAttribute('aria-label', name + '增加' + offer.amount + '，消耗' + offer.cost + (experience ? '经验' : '金币'));
      button.title = button.getAttribute('aria-label'); button.disabled = self.state[offer.currency || 'gold'] < offer.cost;
      button.style.cssText = 'display:flex;align-items:center;justify-content:center;width:100%;height:44px;min-height:44px;padding:0;background:#000;color:white;border:1px solid ' + (shop.selected === index ? '#fff' : '#333') + ';opacity:' + (button.disabled ? '.45' : '1');
      button.appendChild(experience ? art(high ? 151 : 0, 383 + index * 14, 150, 13, 1) : art(high ? 288 + index * 101 : index * 96, 425, high ? 100 : 95, 13, 2));
      self.on(button, 'click', function () { self.buyShop(index); }); panel.appendChild(button);
    });
    var leave = document.createElement('button'); leave.type = 'button'; leave.dataset.role = 'shop-close'; leave.setAttribute('aria-label', '离开商店');
    leave.style.cssText = 'display:flex;align-items:center;justify-content:center;width:100%;height:44px;min-height:44px;padding:0;background:#000;color:white;border:1px solid ' + (shop.selected === 3 ? '#fff' : '#333');
    leave.appendChild(art(332, 495, 50, 13, 2)); self.on(leave, 'click', function () { self.closeShop(); }); panel.appendChild(leave);
    scene.appendChild(panel);
    if (panel.scrollIntoView) panel.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    this.container.focus({ preventScroll: true });
  };
  Tower.prototype.showDialog = function (message, anchor) {
    this.moveQueue = [];
    this.state.dialogPages = Array.isArray(message) ? message.slice() : [message];
    this.state.dialogIndex = 0;
    this.state.dialog = this.state.dialogPages[0];
    this.state.dialogAnchor = anchor || this.state.dialogAnchor || { x: this.state.x, y: this.state.y };
    this.syncDialog();
    var next = this.container.querySelector('[data-role=dialog-close]'); if (next) next.focus({ preventScroll: true });
  };
  Tower.prototype.dismissDialog = function () {
    if (this.state.dialogPages && this.state.dialogIndex + 1 < this.state.dialogPages.length) {
      this.state.dialogIndex += 1;
      this.state.dialog = this.state.dialogPages[this.state.dialogIndex];
      this.syncDialog();
      return;
    }
    this.state.dialog = null;
    this.state.dialogPages = null;
    this.state.dialogIndex = 0;
    // Native RVA 0x1732ce2..0x1732cfe assigns one of each key after the dialogue completes.
    if (this.state.dialogEvent === 'fairy-intro') {
      this.state.keys.red = 1; this.state.keys.blue = 1; this.state.keys.yellow = 1;
      this.state.npcFlags.fairyIntro = true;
      this.state.npcFlags.fairyKeysReceived = true;
      this.state.dialogMove = null;
    }
    if (this.state.dialogEvent === 'jack-rescue') {
      this.state.npcFlags.jackFirstMeeting = true;
      var gate = this.layers[2].cells.indexOf('10');
      if (gate >= 0) this.state.cleared['2:' + gate] = true;
      this.state.dialogMove = null;
    }
    if (this.state.dialogEvent === 'elder-sword' || this.state.dialogEvent === 'merchant-shield') {
      var token = this.state.dialogRewardToken;
      if (token && !this.state.cleared[token]) {
        var shieldGift = this.state.dialogEvent === 'merchant-shield';
        this.state[shieldGift ? 'defense' : 'attack'] += shieldGift ? 85 : 70;
        this.state.inventory[shieldGift ? 'goldenShield' : 'qingfengSword'] = true;
        this.state.cleared[token] = true;
      }
      this.state.dialogRewardToken = null;
      this.state.dialogMove = null;
    }
    this.state.dialogEvent = null;
    // Defer the existing NPC-tile step until the conversation is dismissed; do not rewrite native maps.
    if (this.state.dialogMove) { this.state.x = this.state.dialogMove.x; this.state.y = this.state.dialogMove.y; }
    this.state.dialogMove = null;
    this.state.dialogAnchor = null;
    this.render();
    this.container.focus({ preventScroll: true });
  };
  Tower.prototype.syncDialog = function () {
    var box = this.container.querySelector('[data-role=dialog]');
    if (!box) return;
    box.hidden = !this.state.dialog;
    var select = this.container.querySelector('[data-role=layer]');
    if (select) select.disabled = !!(this.state.dialog || this.state.shop || this.state.door || this.state.won || this.state.lost || this.setName === '魔塔' && !(this.state.inventory && this.state.inventory.compass));
    var text = this.container.querySelector('[data-role=dialog-text]');
    if (text) text.textContent = this.state.dialog || '';
    this.positionDialog();
    // The production gallery scrolls independently of the page on short screens.
    if (this.state.dialog && box.scrollIntoView) box.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  Tower.prototype.positionDialog = function () {
    if (!this.state.dialog || this.setName !== '魔塔') return;
    var box = this.container.querySelector('[data-role=dialog]');
    var grid = this.container.querySelector('[data-role=grid]');
    var anchor = this.state.dialogAnchor || this.state;
    var tile = grid && grid.children[anchor.y * this.width + anchor.x];
    if (!box || !tile || !grid.getBoundingClientRect) return;
    var rect = grid.getBoundingClientRect(), cell = tile.getBoundingClientRect();
    var width = Math.min(300, rect.width - 8);
    box.style.width = width + 'px';
    box.style.maxWidth = 'none';
    var center = cell.left - rect.left + cell.width / 2;
    var left = Math.max(4, Math.min(rect.width - width - 4, center - width / 2));
    box.style.left = left + 'px';
    var above = cell.top - rect.top - 8, below = rect.height - (cell.bottom - rect.top) - 8;
    box.style.maxHeight = Math.max(48, Math.max(above, below)) + 'px';
    var height = box.getBoundingClientRect().height;
    box.style.top = (above >= height ? above - height : cell.bottom - rect.top + 8) + 'px';
  };
  Tower.prototype.showMonsterBook = function () {
    if (this.setName !== '魔塔' || !this.state.inventory || !this.state.inventory.book) return this.note('当前没有怪物手册');
    var layer = this.layers[this.state.layer], rows = [];
    layer.cells.forEach(function (code) {
      var monster = ORIGINAL_MONSTERS[Number(code) - 38];
      if (!monster || rows.some(function (row) { return row.code === code; })) return;
      var battle = originalBattle(this.state, code);
      rows.push({ code: code, hp: monster[0], attack: monster[1], defense: monster[2], damage: battle && battle.allowed ? battle.damage : '无法战斗' });
    }, this);
    this.note(rows.length ? this.floorLabel(this.state.layer) + '怪物：' + rows.map(function (row) { return row.code + ' 生命' + row.hp + ' 攻击' + row.attack + ' 防御' + row.defense + ' 预计损失' + row.damage; }).join('；') : '当前楼层没有怪物，不能查看');
  };
  Tower.prototype.interactNpc = function (code) {
    if (this.setName !== '魔塔') return;
    var key = this.state.layer + ':' + this.state.x + ':' + this.state.y, flags = this.state.npcFlags || (this.state.npcFlags = {}), message;
    if (code === '71') {
      if (this.state.layer !== 21) return this.showDialog('公主：大魔王还没有被打败。');
      if (!this.state.npcFlags.finalBossDefeated) return this.showDialog('公主：请先打败大魔王，我要亲眼看着他倒下。');
      this.state.ending = 'hero'; this.state.won = true;
      return this.showDialog('大魔头被打败了，公主也被救出了塔。勇士和公主一起走出了魔塔。');
    } else if (code === '13' || code === '14' || code === '15') {
      return this.openShop();
    } else if (code === '72') {
      if (code === '72' && !flags.fairyKeysReceived) { this.state.dialogEvent = 'fairy-intro'; message = FAIRY_INTRO; }
      else if (code === '72' && !this.state.inventory.cross) { message = ['仙子：你找到十字架了吗？', '勇士：还，还没有。']; }
      else if (this.state.inventory.cross && !flags.fairyBlessed) { flags.fairyBlessed = true; this.state.attack += 10; this.state.defense += 10; this.state.hp += 1000; message = '仙子：你做得很好，我已经将你现在的能力提升了。'; }
      else message = '仙子：勇敢地去吧，勇士。';
    } else if (code === '74') {
      this.state.dialogMove = null;
      if (this.state.layer === 5 || this.state.layer === 13) return this.openShop('experience');
      if (this.state.layer === 2) {
        this.state.dialogEvent = 'elder-sword';
        this.state.dialogRewardToken = this.state.layer + ':' + (this.state.dialogAnchor.y * this.width + this.state.dialogAnchor.x);
        message = ELDER_SWORD;
      }
      else if (!flags.oldManIntro) { flags.oldManIntro = true; message = '神秘老人：魔塔里的机关都有提示和关联，请认真观察。'; }
      else message = '神秘老人：有些门不能用钥匙打开，只有打败守卫后才会自动打开。';
    } else if (code === '75') {
      this.state.dialogMove = null;
      if (this.state.layer === 2) {
        this.state.dialogEvent = 'merchant-shield';
        this.state.dialogRewardToken = this.state.layer + ':' + (this.state.dialogAnchor.y * this.width + this.state.dialogAnchor.x);
        message = MERCHANT_SHIELD;
      }
      else if (!flags.merchantIntro) { flags.merchantIntro = true; message = '商人：和我交易之后，我会告诉你一些消息。'; }
      else if (!flags.merchantBought && this.state.gold >= 800) { flags.merchantBought = true; this.state.gold -= 800; this.state.defense += 30; message = '商人：好，成交。'; }
      else message = this.state.gold < 800 ? '商人：你还没有800个金币。' : '商人：这是目前能买到的最好的盾牌。';
    } else if (code === '73') {
      this.state.dialogMove = null;
      if (!flags.jackFirstMeeting) {
        this.state.dialogEvent = 'jack-rescue'; message = JACK_INTRO;
      } else if (this.state.inventory.hammer && !flags.hammerDelivered) {
        flags.hammerDelivered = true; delete this.state.inventory.hammer; this.state.gateFlags.hiddenFloor18 = true; message = '杰克：太好了，我这就去帮你修好第十八层的路面。';
      } else if (!flags.jackIntro) { flags.jackIntro = true; message = '杰克：如果你找到嵌了红宝石的铁榔头，还是来找我。'; }
      else message = '杰克：你找到嵌了红宝石的铁榔头了吗？';
    }
    if (message) {
      this.render();
      this.showDialog(message);
    }
    return key;
  };
  Tower.prototype.animateBattle = function () {
    var self = this, battle = this.state.battle;
    if (!battle || !battle.animating) return;
    var tick = function () {
      self.battleTimer = null;
      if (!self.state.battle || !self.state.battle.animating) return;
      battle.shown += 1;
      self.render();
      if (battle.shown >= battle.rounds) {
        battle.shown = battle.rounds;
        battle.animating = false;
        self.render();
        self.note('战斗结束：怪物已被击败，下一步进入原怪物格。');
        self.drainMoveQueue();
        return;
      }
      self.battleTimer = global.setTimeout(tick, 70);
    };
    this.battleTimer = global.setTimeout(tick, 70);
  };
  Tower.prototype.drainMoveQueue = function () {
    if (!this.moveQueue || !this.moveQueue.length || this.state.dialog || this.state.shop || this.state.door || this.state.battle && this.state.battle.animating) return;
    var next = this.moveQueue.shift(), self = this;
    global.setTimeout(function () { if (self.moveQueue && !self.state.dialog && !self.state.shop && !self.state.door) self.move(next[0], next[1]); }, 0);
  };
  Tower.prototype.move = function (dx, dy) {
    if (this.state.won || this.state.lost || this.state.dialog || this.state.shop || this.state.door) return;
    if (this.state.battle && this.state.battle.animating) {
      this.moveQueue = this.moveQueue || [];
      this.moveQueue.push([dx, dy]);
      this.note('战斗进行中，已记录移动 ' + this.moveQueue.length + ' 步');
      return;
    }
    if (Math.abs(dx) + Math.abs(dy) !== 1) return;
    var nx = this.state.x + dx, ny = this.state.y + dy;
    if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) return;
    var i = ny * this.width + nx, original = this.setName === '魔塔', token = this.state.layer + ':' + i;
    this.state.visited = this.state.visited || {}; this.state.visited[this.state.layer] = true;
    this.state.cleared = this.state.cleared || {};
    var code = original && this.state.cleared[token] ? '00' : this.cellCode(i);
    if (original && isOriginalNpc(code)) {
      this.state.dialogAnchor = { x: nx, y: ny };
      this.state.dialogMove = code === '72' && (!this.state.npcFlags.fairyKeysReceived || !this.state.inventory.cross) ? null : { x: nx, y: ny };
      this.interactNpc(code);
      return;
    }
    if (original ? originalKind(code) === 'wall' : isWall(code)) return this.note('墙壁无法通过');
    if (original && code === '09') return this.openIronDoor(i);
    if (original && code === '10') {
      var gate = this.state.layer + ':' + i;
      if (!this.state.gateFlags[gate] && !(this.state.layer === 17 && this.state.gateFlags.hiddenFloor18)) return this.note('神秘的门：没有钥匙，不能打开。');
      this.state.gateFlags[gate] = true;
    }
    if (original ? !!ORIGINAL_DOORS[code] : isDoor(code)) {
      var color = original ? ORIGINAL_DOORS[code] : code === '12' ? 'red' : code === '16' ? 'blue' : code === '17' ? 'yellow' : 'green';
      if (!this.state.keys[color]) return this.note('需要' + ({ red: '红', blue: '蓝', yellow: '黄', green: '绿' }[color]) + '钥匙');
      this.state.keys[color] -= 1;
      if (original) this.state.cleared[token] = true;
    }
    if (original && originalKind(code) === 'enemy') {
      var battle = originalBattle(this.state, code);
      if (!battle.allowed) return this.note(battle.reason);
      var monster = ORIGINAL_MONSTERS[Number(code) - 38];
      this.state.battle = { code: code, rounds: battle.rounds, damage: battle.damage, enemyHp: battle.enemyHp, shown: 0, heroHpStart: this.state.hp, enemyHpStart: monster[0], animating: true };
      this.state.hp = battle.hp; this.state.gold += battle.gold; this.state.experience = (this.state.experience || 0) + battle.experience;
      if (battle.enemyHp === 0) this.state.cleared[token] = true;
      if (this.state.layer === 21 && code === '70' && battle.won) this.state.npcFlags.finalBossDefeated = true;
      if (!battle.won) { this.state.lost = true; this.render(); this.note('战斗失败，请重开'); return; }
      this.render();
      this.animateBattle();
      return;
    }
    if (!original && isEnemy(code) && !this.state.defeated[i]) { var power = Math.max(1, parseInt(code, 10) - 25); this.state.hp -= Math.max(1, power - this.state.defense); if (this.state.hp <= 0) { this.state.lost = true; this.render(); this.note('战斗失败，请重开'); return; } this.state.gold += power; if (original) this.state.cleared[token] = true; else this.state.defeated[i] = true; }
    if (original ? !!ORIGINAL_KEYS[code] : isKey(code)) {
      var key = original ? ORIGINAL_KEYS[code] : code === '20' ? 'red' : code === '21' ? 'blue' : code === '22' ? 'yellow' : 'green';
      this.state.keys[key] += 1;
      if (original) this.state.cleared[token] = true; else this.state.gold += 5;
    }
    if (original && originalPickup(this.state, code)) this.state.cleared[token] = true;
    this.state.x = nx; this.state.y = ny;
    if (!original || !isOriginalNpc(code)) this.state.dialog = null;
    if (original && (code === '11' || code === '12')) {
      var nextFloor = this.state.layer + (code === '12' ? 1 : -1);
      if (nextFloor >= 0 && nextFloor < this.layers.length) {
        this.state.layer = nextFloor;
        var entry = this.layers[nextFloor].cells.indexOf(code === '12' ? '01' : '02');
        if (entry < 0) entry = this.layers[nextFloor].start.y * this.width + this.layers[nextFloor].start.x;
        this.state.x = entry % this.width; this.state.y = Math.floor(entry / this.width);
        this.state.visited[nextFloor] = true;
      }
    } else if (!original && (code === '72' || (this.state.layer === this.layers.length - 1 && nx === this.width - 2 && ny === 1))) { if (this.state.layer < this.layers.length - 1) { this.state.layer += 1; var next = this.layers[this.state.layer].start; this.state.x = next.x; this.state.y = next.y; } else this.state.won = true; }
    this.render();
    if (original && isOriginalNpc(code)) this.interactNpc(code);
    this.container.focus({ preventScroll: true });
  };
  Tower.prototype.render = function () {
    var self = this, layer = this.layers[this.state.layer];
    if (this.doorTimer) { global.clearTimeout(this.doorTimer); this.doorTimer = null; }
    if (this.resizeObserver) this.resizeObserver.disconnect();
    this.handlers.forEach(function (h) { h[0].removeEventListener(h[1], h[2]); }); this.handlers = []; this.keyBound = false;
    this.container.innerHTML = '<div data-role="pk32-tower" style="font-family:system-ui;max-width:760px;margin:auto;color:#20252b;overflow:hidden"><style>.pk32-tower-tile{position:relative;display:grid;place-items:center;min-width:28px;min-height:28px;aspect-ratio:1;border:1px solid #b9a878;padding:0;font-weight:700;font-family:system-ui;font-size:14px}.pk32-tower-tile[data-kind=floor]{background:#f4ead0;color:#c9bd9c}.pk32-tower-tile[data-kind=wall]{background:#39434f;color:#d7dce0}.pk32-tower-tile[data-kind=door]{background:#a64b37;color:#fff}.pk32-tower-tile[data-kind=key]{background:#e3b341;color:#20252b}.pk32-tower-tile[data-kind=treasure]{background:#c88934;color:#fff}.pk32-tower-tile[data-kind=enemy]{background:#713c74;color:#fff}.pk32-tower-tile[data-kind=player]{background:#2374a8;color:#fff}.pk32-tower-tile[data-kind=exit]{background:#2d8c72;color:#fff}.pk32-tower-grid-wrap{position:relative;width:100%;max-width:100%;overflow:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;touch-action:pan-x pan-y}.pk32-tower-grid{width:max-content;min-width:100%;touch-action:auto}.pk32-dialog{padding:10px;margin:0;background:#fff4cf;border:2px solid #9d6b2b;box-shadow:2px 2px 0 #6b4a25}.pk32-dpad{display:grid;grid-template-columns:repeat(3,52px);grid-template-rows:repeat(3,48px);gap:4px;justify-content:center;margin-top:10px}.pk32-dpad button{min-width:48px;min-height:44px}.pk32-dpad [data-dir=up]{grid-column:2}.pk32-dpad [data-dir=left]{grid-column:1;grid-row:2}.pk32-dpad [data-dir=down]{grid-column:2;grid-row:3}.pk32-dpad [data-dir=right]{grid-column:3;grid-row:2}@media (max-width:600px){.pk32-tower-tile{min-width:30px;min-height:30px}.pk32-tower-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:6px}.pk32-tower-stats{line-height:1.6;overflow-wrap:anywhere}}</style><div class="pk32-tower-toolbar"><strong>PK32 ' + this.setName + ' 迁移</strong><label>地图 <select data-role="layer"></select></label><button data-role="restart">重开</button><button data-role="save">存档</button><button data-role="load">读档</button></div><div data-role="message" style="min-height:28px;padding:8px 0">第' + (this.state.layer + 1) + '层</div><div data-role="dialog" class="pk32-dialog" hidden></div><div data-role="battle" class="pk32-dialog" hidden></div><div data-role="stats" class="pk32-tower-stats"></div><div class="pk32-tower-grid-wrap"><div data-role="grid" class="pk32-tower-grid" style="display:grid;grid-template-columns:repeat(' + this.width + ',minmax(28px,1fr));gap:1px"></div></div><div class="pk32-dpad"><button data-dir=up>上</button><button data-dir=left>左</button><button data-dir=down>下</button><button data-dir=right>右</button></div></div>';
    var original = this.setName === '魔塔';
    var root = this.container.querySelector('[data-role=pk32-tower]'); root.dataset.assetSource = original ? 'picform-22' : 'pk32-tower-sheet'; root.dataset.assetStatus = original ? 'native-tile-mapping' : 'mapping-incomplete'; root.dataset.rulesStatus = 'incomplete';
    var dialog = this.container.querySelector('[data-role=dialog]');
    dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-label', '剧情对话');
    var dialogText = document.createElement('div'); dialogText.dataset.role = 'dialog-text'; dialogText.setAttribute('aria-live', 'polite'); dialog.appendChild(dialogText);
    var dialogClose = document.createElement('button'); dialogClose.type = 'button'; dialogClose.dataset.role = 'dialog-close'; dialogClose.textContent = '继续'; dialog.appendChild(dialogClose);
    this.on(dialogClose, 'click', function () { self.dismissDialog(); });
    if (original) {
      var artStyle = document.createElement('style');
      artStyle.textContent = '[data-asset-source=picform-22]{background:#181b20;color:#f0f1f2!important;padding:8px;box-sizing:border-box}[data-asset-source=picform-22] .pk32-tower-grid{width:352px;max-width:100%;min-width:0;margin:auto}[data-asset-source=picform-22] .pk32-tower-tile{border:0;border-radius:0;min-width:0;min-height:0;width:100%;aspect-ratio:1;box-sizing:border-box;background-repeat:no-repeat;image-rendering:pixelated}[data-asset-source=picform-22] .pk32-tower-tile:focus-visible{outline:2px solid #fff;outline-offset:-2px}[data-asset-source=picform-22] .pk32-tower-toolbar{display:flex;gap:6px;flex-wrap:wrap;align-items:center}[data-asset-source=picform-22] button:not(.pk32-tower-tile){min-height:44px;min-width:44px;padding:6px 10px;border:1px solid #888;border-radius:2px;background:#eee;color:#111}[data-asset-source=picform-22] .pk32-tower-grid button{min-height:0}';
      root.appendChild(artStyle);
    }
    var select = this.container.querySelector('[data-role=layer]'); this.state.visited = this.state.visited || {}; this.state.visited[this.state.layer] = true; this.layers.forEach(function (_, i) { if (!self.state.visited[i]) return; var o = document.createElement('option'); o.value = i; o.textContent = self.floorLabel(i); o.selected = i === self.state.layer; select.appendChild(o); }); select.disabled = original && !(this.state.inventory && this.state.inventory.compass); select.title = select.disabled ? '得到风之罗盘后才能传送到已访问楼层' : '选择已访问楼层';
    this.note(this.floorLabel(this.state.layer));
    var grid = this.container.querySelector('[data-role=grid]');
    if (dialog && original) {
      grid.style.position = 'relative';
      dialog.style.cssText = 'position:absolute;z-index:3;box-sizing:border-box;overflow:auto;overflow-wrap:anywhere;line-height:1.5;color:#20252b;font-size:14px';
      dialogClose.style.cssText = 'display:block;margin:8px 0 0 auto';
    }
    if (original) { grid.style.gridTemplateColumns = 'repeat(11,minmax(0,1fr))'; grid.style.gap = '0'; }
    layer.cells.forEach(function (code, i) {
      code = self.cellCode(i);
      var b = document.createElement('button'), x = i % self.width, y = Math.floor(i / self.width), kind = original ? originalKind(code) : tileKind(code);
      var player = self.state.x === x && self.state.y === y;
      var cleared = original ? self.state.cleared && self.state.cleared[self.state.layer + ':' + i] : self.state.defeated[i];
      b.type = 'button'; b.className = 'pk32-tower-tile'; b.dataset.code = code; b.dataset.kind = player ? 'player' : cleared ? 'floor' : kind;
      b.title = player ? '主角' : original ? (ORIGINAL_NAMES[code] || ORIGINAL_ITEMS[code] && ORIGINAL_ITEMS[code].name || (kind === 'enemy' ? '怪物' : kind === 'treasure' ? '道具' : '场景')) : tileName(code);
      b.setAttribute('aria-label', b.title);
      if (original) paintSprite(b, player ? '76' : cleared ? '00' : code);
      else b.textContent = player ? '@' : cleared ? '' : tileGlyph(code);
      if (original && self.state.door && self.state.door.layer === self.state.layer && self.state.door.index === i) {
        paintSprite(b, '00'); b.style.overflow = 'hidden';
        var shutter = document.createElement('span');
        shutter.dataset.role = 'door-frame'; shutter.setAttribute('aria-hidden', 'true');
        shutter.style.cssText = 'position:absolute;inset:0;background-repeat:no-repeat;image-rendering:pixelated;transform:translateY(' + self.state.door.step * 12.5 + '%)';
        paintSprite(shutter, code); b.appendChild(shutter);
      }
      self.on(b, 'click', function () { if (Math.abs(self.state.x - x) + Math.abs(self.state.y - y) === 1) self.move(x - self.state.x, y - self.state.y); }); grid.appendChild(b);
    });
    var stats = this.container.querySelector('[data-role=stats]');
    stats.textContent = '生命 ' + this.state.hp + '　攻击 ' + this.state.attack + '　防御 ' + this.state.defense + '　金币 ' + this.state.gold + (original ? '　经验 ' + (this.state.experience || 0) : '') + '　钥匙：红 ' + this.state.keys.red + ' 蓝 ' + this.state.keys.blue + ' 黄 ' + this.state.keys.yellow;
    if (original) {
      var equipment = document.createElement('div'); equipment.dataset.role = 'equipment'; equipment.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin:6px 0';
      ['sword', 'shield'].forEach(function (slot) {
        var code = equipmentCode(self.state, slot), entry = document.createElement('span');
        var gift = slot === 'sword' ? self.state.inventory.qingfengSword && (!code || Number(code) < 33) : self.state.inventory.goldenShield && (!code || Number(code) < 37);
        entry.dataset.equipment = slot; entry.style.cssText = 'display:inline-flex;align-items:center;gap:4px';
        if (code && !gift) { var icon = document.createElement('span'); icon.style.cssText = 'display:inline-block;width:32px;height:32px;background-repeat:no-repeat;image-rendering:pixelated'; icon.setAttribute('aria-hidden', 'true'); paintSprite(icon, code); entry.appendChild(icon); }
        var label = document.createElement('span'); label.textContent = gift ? (slot === 'sword' ? '青锋剑' : '黄金盾') : code ? ORIGINAL_ITEMS[code].name : slot === 'sword' ? '未获得剑' : '未获得盾'; entry.appendChild(label); equipment.appendChild(entry);
      });
      stats.appendChild(equipment);
      var scene = document.createElement('div'); scene.style.cssText = 'position:relative;width:352px;max-width:100%;margin:auto';
      this.container.querySelector('.pk32-tower-grid-wrap').appendChild(scene); scene.appendChild(grid); scene.appendChild(dialog);
      this.renderShop(scene);
      if (this.state.shop || this.state.door) select.disabled = true;
      if (global.ResizeObserver) { this.resizeObserver = new global.ResizeObserver(function () { self.positionDialog(); }); this.resizeObserver.observe(grid); }
    }
    this.syncDialog();
    if (this.state.battle) { var battleBox = this.container.querySelector('[data-role=battle]'), battle = this.state.battle, total = Math.max(1, battle.rounds), shown = Math.min(total, battle.shown || 0), heroHp = shown >= total ? this.state.hp : Math.max(0, battle.heroHpStart - Math.floor(battle.damage * shown / total)), enemyHp = shown >= total ? battle.enemyHp : Math.max(0, battle.enemyHpStart - Math.floor((battle.enemyHpStart - battle.enemyHp) * shown / total)); battleBox.hidden = false; battleBox.dataset.round = String(shown); battleBox.textContent = '战斗：怪物 ' + battle.code + '　回合 ' + shown + ' / ' + battle.rounds + '　主角生命 ' + heroHp + '　怪物生命 ' + enemyHp + '　受到伤害 ' + battle.damage; battleBox.classList.add('pk32-battle-hit'); }
    this.on(select, 'change', function () { if (select.disabled || self.state.dialog || self.state.shop || self.state.door || self.state.won || self.state.lost) return; var next = Number(select.value); if (!self.state.visited[next]) return self.note('只能前往已经走过的楼层'); var entry = self.layers[next].start; self.state.layer = next; self.state.x = entry.x; self.state.y = entry.y; self.render(); self.note('已传送到第' + (next + 1) + '层'); }); this.on(this.container.querySelector('[data-role=restart]'), 'click', function () { self.restart(); }); this.on(this.container.querySelector('[data-role=save]'), 'click', function () { self.save(); }); this.on(this.container.querySelector('[data-role=load]'), 'click', function () { self.load(); });
    [['up', 0, -1], ['left', -1, 0], ['down', 0, 1], ['right', 1, 0]].forEach(function (d) { self.on(self.container.querySelector('[data-dir=' + d[0] + ']'), 'click', function () { self.move(d[1], d[2]); }); });
    if (!this.keyBound) { this.keyBound = true; this.on(this.container, 'keydown', function (e) {
      if (self.state.shop) {
        if (e.key === 'Escape') { e.preventDefault(); self.closeShop(); }
        else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); self.state.shop.selected = Math.max(0, Math.min(3, self.state.shop.selected + (e.key === 'ArrowUp' ? -1 : 1))); self.render(); }
        else if ((e.key === 'Enter' || e.key === ' ') && e.target.tagName !== 'BUTTON') { e.preventDefault(); if (self.state.shop.selected === 3) self.closeShop(); else self.buyShop(self.state.shop.selected); }
        return;
      }
      if (self.state.door) { if (/^(Arrow|Enter| )/.test(e.key)) e.preventDefault(); return; }
      if (self.state.dialog) { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); self.dismissDialog(); } return; }
      if (e.target && /^(SELECT|INPUT|TEXTAREA|BUTTON)$/.test(e.target.tagName)) return;
      if (e.key === ' ') { e.preventDefault(); self.showMonsterBook(); return; }
      if (e.key === 'Enter' && self.state.inventory && self.state.inventory.compass) { e.preventDefault(); var first = Object.keys(self.state.visited || {}).map(Number).filter(function (n) { return n !== self.state.layer; }).sort(function (a, b) { return a - b; })[0]; if (first == null) return self.note('风之罗盘：还没有其他已经走过的楼层。'); self.state.layer = first; self.state.x = self.layers[first].start.x; self.state.y = self.layers[first].start.y; self.render(); self.note('风之罗盘：已传送到第' + (first + 1) + '层'); return; }
      var k = { ArrowUp: [0, -1], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowRight: [1, 0], w: [0, -1], a: [-1, 0], s: [0, 1], d: [1, 0] }[e.key];
      if (k) { e.preventDefault(); self.move(k[0], k[1]); self.container.focus({ preventScroll: true }); }
    }); } this.container.tabIndex = 0;
    if (this.state.dialog) dialogClose.focus({ preventScroll: true });
    if (this.state.door) this.doorTimer = global.setTimeout(function () { self.doorTimer = null; self.advanceDoor(); }, 40);
  };
  Tower.prototype.destroy = function () { if (this.doorTimer) { global.clearTimeout(this.doorTimer); this.doorTimer = null; } if (this.battleTimer) { global.clearTimeout(this.battleTimer); this.battleTimer = null; } if (this.resizeObserver) this.resizeObserver.disconnect(); this.handlers.forEach(function (h) { h[0].removeEventListener(h[1], h[2]); }); this.handlers = []; this.container.innerHTML = ''; };
  global.PK32Tower = { maps: MAPS, layers: LAYERS, sets: TOWER_SETS, tileSprite: tileSprite, originalMonsters: ORIGINAL_MONSTERS, originalBattle: originalBattle, originalItems: ORIGINAL_ITEMS, originalPickup: originalPickup, originalShopOffers: originalShopOffers, startUI: function (container, opts) { return new Tower(container, opts); }, create: function (opts) { return new Tower(opts.container, opts); } };
}(window));
