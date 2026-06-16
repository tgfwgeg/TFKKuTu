'use strict';
/**
 * 산성비 (KSB) 서버 게임 로직
 * 경로: Server/lib/Game/games/sansung.js
 */

var Lizard = require('../../sub/lizard');
var DB;
var DIC;

var SCAN_INTERVAL       = 300;
var POOL_SIZE           = 200;
var SPAWN_INTERVAL_INIT = 4000;
var SPAWN_INTERVAL_MIN  = 1000;
var FALL_DURATION_INIT  = 8000;
var FALL_DURATION_MIN   = 3000;
var SPEED_RATE          = 0.97;
var MAX_WORDS_SCREEN    = 8;
var SCORE_HIT_MIN       = 10;
var SCORE_HIT_MAX       = 20;

var CIRCLE_NUMS = '①②③④⑤⑥⑦⑧⑨⑩';

exports.init = function (_DB, _DIC) {
	DB  = _DB;
	DIC = _DIC;
};

// getTitle: 단어 풀 로드 후 "①②③..." 단일 문자열 반환
exports.getTitle = function () {
	var R  = new Lizard.Tail();
	var my = this;
	var isEn   = my.rule.lang === 'en';
	var table  = isEn ? 'kkutu_en' : 'kkutu_ko';
	var filter = isEn ? "_id ~ '^[a-z]+$'" : "_id ~ '^[가-힣]+$'";
	var lens   = isEn ? [3, 4, 5] : [2, 3, 4];
	var pool   = [];
	var pending = lens.length;

	lens.forEach(function (len) {
		var sql = 'SELECT _id FROM ' + table +
			' WHERE LENGTH(_id) = ' + len +
			' AND hit >= 1 AND ' + filter +
			' ORDER BY RANDOM() LIMIT ' + Math.floor(POOL_SIZE / lens.length);
		DB.kkutu[isEn ? 'en' : 'ko'].direct(sql, function (err, res) {
			if (!err && res && res.rows) {
				res.rows.forEach(function (r) { pool.push(r._id); });
			}
			if (--pending === 0) {
				pool.sort(function () { return Math.random() - 0.5; });
				my.game.wordPool = pool;
				R.go(CIRCLE_NUMS);
			}
		});
	});

	return R;
};

// roundReady: 매 라운드 시작
exports.roundReady = function () {
	var my = this;

	_clearTimers(my);

	// seq를 별도 변수에 저장 (turnEnd 시점에 my.game.seq가 사라져도 안전하게)
	my.game._ssSeq = (my.game.seq || []).slice();

	my.game.words         = {};
	my.game.wordIdCounter = 0;
	my.game.spawnInterval = SPAWN_INTERVAL_INIT;
	my.game.fallDuration  = FALL_DURATION_INIT;
	my.game.lastSpawnTime = 0;
	my.game.scores        = my.game.scores || {};
	my.game.late          = false;

	_eachPlayer(my, function (pid, o) {
		if (o) o.game.score = 0;
	});

	_publish(my, 'roundReady', { round: my.game.round });

	my.game._rrt = setTimeout(function () {
		my.game._rrt = null;
		my.turnStart();
	}, 2000);
};

// turnStart: 게임 루프 시작
exports.turnStart = function () {
	var my = this;
	if (!my.gaming || !my.game || my.game.late) return;

	my.game.late          = false;
	my.game.lastSpawnTime = Date.now();

	_spawnWord(my);

	my.game.scanTimer = setInterval(function () {
		if (!my.gaming || !my.game || my.game.late) {
			clearInterval(my.game.scanTimer);
			my.game.scanTimer = null;
			return;
		}

		var now = Date.now();

		if (now - my.game.lastSpawnTime >= my.game.spawnInterval
				&& Object.keys(my.game.words).length < MAX_WORDS_SCREEN) {
			my.game.lastSpawnTime = now;
			my.game.spawnInterval = Math.max(SPAWN_INTERVAL_MIN,
				Math.floor(my.game.spawnInterval * SPEED_RATE));
			my.game.fallDuration  = Math.max(FALL_DURATION_MIN,
				Math.floor(my.game.fallDuration  * SPEED_RATE));
			_spawnWord(my);
		}

		Object.keys(my.game.words).forEach(function (id) {
			if (now >= my.game.words[id].fallEndTime) {
				var word = my.game.words[id].word;
				delete my.game.words[id];
				_publish(my, 'turnEnd', { wordId: Number(id), word: word, ok: false, penalty: 5 });
			}
		});
	}, SCAN_INTERVAL);

	// my.time(초) → ms 변환
	var roundMs = my.time * 1000;
	my.game._turnEndTimer = setTimeout(function () {
		my.game._turnEndTimer = null;
		exports.turnEnd.call(my);
	}, roundMs);

	_publish(my, 'turnStart', { roundTime: roundMs });
};

// submit: 단어 입력
exports.submit = function (client, text) {
	var my = this;
	if (!my.game || my.game.late) return;

	var word = (text || '').trim();
	if (!word) return;

	var matchId = null;
	Object.keys(my.game.words).forEach(function (id) {
		if (my.game.words[id].word === word) matchId = id;
	});
	if (matchId === null) return;

	delete my.game.words[matchId];

	var score = Math.floor(Math.random() * (SCORE_HIT_MAX - SCORE_HIT_MIN + 1)) + SCORE_HIT_MIN;
	if (!my.game.scores[client.id]) my.game.scores[client.id] = 0;
	my.game.scores[client.id] += score;
	if (DIC[client.id]) DIC[client.id].game.score = my.game.scores[client.id];

	_publish(my, 'turnEnd', {
		wordId:   Number(matchId),
		word:     word,
		ok:       true,
		score:    score,
		playerId: client.id,
		scores:   my.game.scores
	});
};

// turnEnd: 라운드 시간 종료 (여기서 forEach 에러 발생했었음 → seq 안전 참조로 수정)
exports.turnEnd = function () {
	var my = this;
	if (!my.game) return;

	my.game.late = true;
	_clearTimers(my);

	// my.game.seq가 사라졌어도 _ssSeq로 안전하게 처리
	var seq = my.game.seq || my.game._ssSeq || [];
	seq.forEach(function (sid) {
		var pid = typeof sid === 'object' ? sid.id : sid;
		var o   = DIC[pid];
		if (o) o.game.score = (my.game.scores || {})[pid] || 0;
	});

	_publish(my, 'turnEnd', { ok: false });

	my.game._rrt = setTimeout(function () {
		my.game._rrt = null;
		my.roundEnd();
	}, 3000);
};

exports.turnHint   = function () {};
exports.readyRobot = function () {};
exports.turnRobot  = function () {};
exports.getScore   = function () { return 0; };

// ── 내부 함수 ─────────────────────────────────────────

function _clearTimers(my) {
	if (!my.game) return;
	if (my.game.scanTimer)     { clearInterval(my.game.scanTimer);    my.game.scanTimer     = null; }
	if (my.game._rrt)          { clearTimeout(my.game._rrt);          my.game._rrt          = null; }
	if (my.game._turnEndTimer) { clearTimeout(my.game._turnEndTimer); my.game._turnEndTimer = null; }
}

// seq는 항상 my.game.seq를 우선, 없으면 _ssSeq를 사용하는 안전한 헬퍼
function _eachPlayer(my, cb) {
	var seq = (my.game && (my.game.seq || my.game._ssSeq)) || [];
	seq.forEach(function (sid) {
		var pid = typeof sid === 'object' ? sid.id : sid;
		cb(pid, DIC[pid]);
	});
}

function _spawnWord(my) {
	var pool = my.game.wordPool;
	if (!pool || !pool.length) return;

	var onScreen   = Object.keys(my.game.words).map(function (id) { return my.game.words[id].word; });
	var candidates = pool.filter(function (w) { return onScreen.indexOf(w) === -1; });
	if (!candidates.length) candidates = pool;

	var word = candidates[Math.floor(Math.random() * candidates.length)];
	var id   = ++my.game.wordIdCounter;
	var now  = Date.now();

	my.game.words[id] = { word: word, fallEndTime: now + my.game.fallDuration };

	_eachPlayer(my, function (pid) {
		if (DIC[pid]) DIC[pid].send('sansung-word', {
			wordId:       id,
			word:         word,
			fallDuration: my.game.fallDuration
		});
	});
}

function _publish(my, type, data) {
	_eachPlayer(my, function (pid) {
		if (DIC[pid]) DIC[pid].send(type, data);
	});
}