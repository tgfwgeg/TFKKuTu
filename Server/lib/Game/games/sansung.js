'use strict';
/**
 * 산성비 (KSB) 서버 게임 로직
 * 경로: Server/lib/Game/games/sansung.js
 */

var DB;
var DIC;

var SPAWN_INTERVAL_INIT = 4000;
var SPAWN_INTERVAL_MIN  = 1000;
var SPEED_RATE          = 0.97;
var FALL_DURATION_INIT  = 8000;
var FALL_DURATION_MIN   = 3000;
var SCORE_HIT_MIN  = 10;
var SCORE_HIT_MAX  = 20;
var SCORE_MISS_MIN = 1;
var SCORE_MISS_MAX = 10;
var WORD_POOL_SIZE    = 150;
var MAX_WORDS_SCREEN  = 8;
var TICK_MS           = 300;

// kkutu.js 의 Rule 초기화 시 호출됨
exports.init = function(_DB, _DIC) {
    DB  = _DB;
    DIC = _DIC;
};

// ── Room.roundReady() → my.route("roundReady") 로 호출됨 ─────────
exports.roundReady = function() {
    var my = this; // Room 객체
    var gs;

    my.game.sansung = gs = {
        words:         {},
        wordPool:      [],
        wordIdCounter: 0,
        spawnInterval: SPAWN_INTERVAL_INIT,
        fallDuration:  FALL_DURATION_INIT,
        lastSpawnTime: 0,
        scores:        {},
        tick:          null,
        running:       false
    };

    // 플레이어 점수 초기화
    my.game.seq.forEach(function(id) {
        gs.scores[typeof id === 'object' ? id.id : id] = 0;
    });

    _loadWordPool(my, function() {
        _startGame(my);
    });
};

// ── 채팅 입력 처리: kkutu.js 의 onClientMessage 에서 talk 수신 시 호출 ─
// ready.js 에서 sansung:true 플래그를 붙여서 보내면
// kkutu.js 의 onClientMessage 에서 아래처럼 분기:
//
//   case 'talk':
//     if(data.sansung && room && room.game && room.game.sansung){
//       Rule['Sansung'].submit.call(room, client, data.value);
//       return;
//     }
//     ... 기존 talk 처리 ...
//
exports.submit = function(client, text) {
    var my = this;
    var gs = my.game.sansung;
    if (!gs || !gs.running) return;

    var word = (text || '').trim();
    if (!word) return;

    // 화면에 있는 단어와 매칭
    var matchId = null;
    var ids = Object.keys(gs.words);
    for (var i = 0; i < ids.length; i++) {
        if (gs.words[ids[i]].word === word) { matchId = ids[i]; break; }
    }
    if (matchId === null) return;

    var matched = gs.words[matchId];
    delete gs.words[matchId];

    var score = Math.floor(Math.random() * (SCORE_HIT_MAX - SCORE_HIT_MIN + 1)) + SCORE_HIT_MIN;
    if (!gs.scores[client.id]) gs.scores[client.id] = 0;
    gs.scores[client.id] += score;

    _publish(my, 'sansung-hit', {
        id:       Number(matchId),
             word:     matched.word,
             score:    score,
             playerId: client.id,
             scores:   gs.scores
    });
};

// ── 라운드/게임 종료 시 호출 ──────────────────────────────────────
exports.roundEnd = function() { _endGame(this); };
exports.turnEnd  = function() { _endGame(this); };

// ── KKuTu Room 이 필요로 하는 나머지 스텁 ────────────────────────
exports.getTitle   = function() { return Promise.resolve(['산성비']); };
exports.turnStart  = function() {};
exports.turnHint   = function() {};
exports.readyRobot = function() {};
exports.turnRobot  = function() {};
exports.getScore   = function() { return 0; };

// ─────────────────────────────────────────────────────────────────
// 내부 함수
// ─────────────────────────────────────────────────────────────────

function _loadWordPool(room, cb) {
    var gs = room.game.sansung;
    // KKuTu DB는 Lizard ORM: DB.kkutu_ko.find()
    DB.kkutu_ko
    .find({ _cond: ['length(_id) BETWEEN 1 AND 6'] })
    .limit(['_id', true])
    .on(function(rows) {
        if (!rows || !rows.length) {
            gs.wordPool = ['사과','바나나','포도','딸기','수박','멜론','복숭아','하늘','바람','구름'];
        } else {
            // 전체 중 랜덤으로 WORD_POOL_SIZE개 선택
            var pool = rows.map(function(r) { return r._id; });
            pool.sort(function() { return Math.random() - 0.5; });
            gs.wordPool = pool.slice(0, WORD_POOL_SIZE);
        }
        cb();
    });
}

function _startGame(room) {
    var gs = room.game.sansung;
    gs.running       = true;
    gs.lastSpawnTime = Date.now();

    _spawnWord(room);

    gs.tick = setInterval(function() {
        if (!gs.running) { clearInterval(gs.tick); return; }

        var now = Date.now();

        // 단어 생성
        if (now - gs.lastSpawnTime >= gs.spawnInterval
            && Object.keys(gs.words).length < MAX_WORDS_SCREEN) {
            gs.lastSpawnTime = now;
        gs.spawnInterval = Math.max(SPAWN_INTERVAL_MIN, Math.floor(gs.spawnInterval * SPEED_RATE));
        gs.fallDuration  = Math.max(FALL_DURATION_MIN,  Math.floor(gs.fallDuration  * SPEED_RATE));
        _spawnWord(room);
            }

            // 바닥 도달 체크
            Object.keys(gs.words).forEach(function(id) {
                if (now >= gs.words[id].fallEndTime) {
                    var word    = gs.words[id].word;
                    var penalty = Math.floor(Math.random() * (SCORE_MISS_MAX - SCORE_MISS_MIN + 1)) + SCORE_MISS_MIN;
                    delete gs.words[id];

                    Object.keys(gs.scores).forEach(function(pid) {
                        gs.scores[pid] = Math.max(0, gs.scores[pid] - penalty);
                    });

                    _publish(room, 'sansung-miss', {
                        id:      Number(id),
                             word:    word,
                             penalty: penalty,
                             scores:  gs.scores
                    });
                }
            });
    }, TICK_MS);
}

function _spawnWord(room) {
    var gs   = room.game.sansung;
    var pool = gs.wordPool;
    if (!pool.length) { _loadWordPool(room, function() { _spawnWord(room); }); return; }

    // 이미 화면에 있는 단어 제외
    var onScreen = Object.keys(gs.words).map(function(id) { return gs.words[id].word; });
    var candidates = pool.filter(function(w) { return onScreen.indexOf(w) === -1; });
    if (!candidates.length) candidates = pool;

    var word = candidates[Math.floor(Math.random() * candidates.length)];
    var idx  = pool.indexOf(word);
    if (idx !== -1) pool.splice(idx, 1);
    if (pool.length < 20) _loadWordPool(room, function() {});

    var id  = ++gs.wordIdCounter;
    var now = Date.now();
    gs.words[id] = { word: word, fallEndTime: now + gs.fallDuration };

    _publish(room, 'sansung-spawn', {
        id:           id,
        word:         word,
        fallDuration: gs.fallDuration
    });
}

function _endGame(room) {
    var gs = room.game.sansung;
    if (!gs) return;
    gs.running = false;
    if (gs.tick) { clearInterval(gs.tick); gs.tick = null; }
    _publish(room, 'sansung-end', { scores: gs.scores });
    room.game.sansung = null;
}

function _publish(room, type, data) {
    room.game.seq.forEach(function(id) {
        var pid = typeof id === 'object' ? id.id : id;
        if (DIC[pid]) DIC[pid].send(type, data);
    });
}
