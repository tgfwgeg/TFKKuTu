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

// getTitle: 단어 풀 로드 + "①②③..." 단일 문자열 반환 (라운드 번호 표시용)
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

// roundReady: 라운드 증가 + 종료 여부 판단 (raingame과 동일한 패턴)
exports.roundReady = function () {
	var my = this;

	_clearTimers(my);

	// 라운드 증가, 설정된 라운드 수를 넘으면 게임 전체 종료
	my.game.round = (my.game.round || 0) + 1;
	if (my.game.round > my.round) {
		my.roundEnd();
		return;
	}

	// 점수는 라운드 간 누적 (최초 1회만 0으로 초기화)
	if (!my.game.scores) {
		my.game.scores = {};
		my.game.seq.forEach(function (sid) {
			var pid = typeof sid === 'object' ? sid.id : sid;
			my.game.scores[pid] = 0;
		});
	}

	// 이번 라운드 상태 초기화
	my.game.words         = {};
	my.game.wordIdCounter = 0;
	my.game.spawnInterval = SPAWN_INTERVAL_INIT;
	my.game.fallDuration   = FALL_DURATION_INIT;
	my.game.lastSpawnTime  = 0;
	my.game.late           = false;

	_publish(my, 'roundReady', { round: my.game.round });

	// 2초 후 turnStart
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
				_publish(my, 'turnEnd', { wordId: Number(id), word: word, ok: false });
			}
		});
	}, SCAN_INTERVAL);

	// my.time(초) → ms
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

// turnEnd: 이번 라운드 시간 종료 → roundReady를 다시 호출해 다음 라운드로 진행
// (roundReady 내부에서 my.game.round > my.round 인지 체크해 실제 게임 종료를 판단함)
exports.turnEnd = function () {
	var my = this;
	if (!my.game) return;

	my.game.late = true;
	_clearTimers(my);

	// 누적 점수를 game.score에 반영 (결과창 집계용)
	my.game.seq.forEach(function (sid) {
		var pid = typeof sid === 'object' ? sid.id : sid;
		var o   = DIC[pid];
		if (o) o.game.score = my.game.scores[pid] || 0;
	});

	_publish(my, 'turnEnd', { ok: false });

	// 2초 후 다음 라운드(또는 게임 종료) 진행
	my.game._rrt = setTimeout(function () {
		my.game._rrt = null;
		my.roundReady();
	}, 2000);
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

	my.game.seq.forEach(function (sid) {
		var pid = typeof sid === 'object' ? sid.id : sid;
		if (DIC[pid]) DIC[pid].send('sansung-word', {
			wordId:       id,
			word:         word,
			fallDuration: my.game.fallDuration
		});
	});
}

function _publish(my, type, data) {
	my.game.seq.forEach(function (sid) {
		var pid = typeof sid === 'object' ? sid.id : sid;
		if (DIC[pid]) DIC[pid].send(type, data);
	});
}