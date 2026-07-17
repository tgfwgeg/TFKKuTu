/**
 * 산성비 (KSB) 클라이언트 룰
 * 경로: Server/lib/Web/lib/kkutu/rule_sansung.js
 */

(function () {
	if (document.getElementById('ss-style')) return;
	var css = [
		"@font-face{font-family:'Galmuri14';",
		"src:url('https://fastly.jsdelivr.net/gh/projectnoonnu/2506-1@1.0/Galmuri14.woff2') format('woff2');",
		"font-weight:normal;font-style:normal;}",

		/* jjoriping 왼쪽 고정, 새 디자인 */
		".jjoriping.ss-skin{ width:600px; }",
		".jjoriping.ss-skin .jjoObj{ display:none; }",

		".jjoriping.ss-skin .jjoDisplayBar{",
		"width:586px;height:308px;padding:8px;",
		"border:none;border-radius:16px;",
		"background:linear-gradient(180deg,#1c2b40 0%,#0c1622 100%);",
		"box-shadow:0 8px 24px rgba(0,0,0,.55),inset 0 0 0 1px rgba(120,200,255,.12);}",

		/* 핵심: overflow:hidden 으로 단어가 캔버스 안에서만 보임 */
		".jjoriping.ss-skin .jjo-display{",
		"position:relative !important;",
		"width:570px !important;height:260px !important;",
		"padding:0 !important;overflow:hidden !important;",
		"background:rgba(5,12,20,.55);border-radius:10px;}",

		".jjoriping.ss-skin .jjo-round-time{width:570px;border-radius:8px;background:#15314f;}",
		".jjoriping.ss-skin .jjo-round-time .graph-bar{background:#3aa0ff;}",

		/* 낙하 단어: 배경 없음, 볼드 없음, 갈무리14 */
		".ss-word{position:absolute;",
		"font-family:'Galmuri14','NBGothic',돋움,sans-serif;",
		"font-weight:normal;font-size:20px;color:#d8f3ff;",
		"text-shadow:0 0 8px rgba(80,200,255,.6),0 1px 2px rgba(0,0,0,.7);",
		"background:none;border:none;padding:0;",
		"white-space:nowrap;pointer-events:none;transition:top linear;}",

		".ss-word.ss-hit{transition:none !important;animation:ss-hit .35s ease-out forwards;}",
		"@keyframes ss-hit{0%{opacity:1;transform:scale(1.2)}100%{opacity:0;transform:scale(.5) translateY(-20px)}}",

		"#ss-score{position:absolute;top:8px;right:10px;",
		"font-family:'Galmuri14','NBGothic',돋움;font-weight:normal;font-size:14px;color:#eafcff;",
		"background:rgba(10,20,32,.65);padding:4px 12px;border-radius:8px;",
		"z-index:20;pointer-events:none;}",

		".ss-popup{position:absolute;right:14px;top:34px;",
		"font-family:'Galmuri14','NBGothic',돋움;font-weight:normal;font-size:14px;color:#7cf7a0;",
		"animation:ss-pop .9s ease-out forwards;pointer-events:none;z-index:21;}",
		"@keyframes ss-pop{0%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(-22px)}}",

		/* 모레미 숨기기: ss-active id가 있을 때만 */
		"#ss-active .game-user-image,#ss-active .moremi{display:none !important;}",
		"#ss-active .game-user-title{margin-left:0 !important;}"
	].join('');
	$('<style id="ss-style">').text(css).appendTo('head');
}());

$lib.Sansung._words = {};

$lib.Sansung.roundReady = function (data, spec) {
	clearBoard(); // ss-skin, ss-active 는 clearBoard 안에서 제거됨
	$data._relay     = true;
	$data._roundTime = $data.room.time * 1000;
	$data._fastTime  = 10000;
	$lib.Sansung._words = {};

	$('.jjoriping,.rounds,.game-body').addClass('cw');
	$('.jjoriping').addClass('ss-skin');
	$('.game-body').attr('id', 'ss-active');

	$stage.game.items.hide();
	$stage.game.hints.hide();
	$stage.game.cwcmd.hide();
	$stage.game.bb.hide();
	$stage.game.here.hide();

	$stage.game.display.empty();
	$('<div id="ss-score">점수: 0</div>').appendTo($stage.game.display);

	drawRound(data.round);
	if (!spec) playSound('round_start');
	clearInterval($data._tTime);
};

$lib.Sansung.turnStart = function (data) {
	clearInterval($data._tTime);
	$data._roundTime = data.roundTime || ($data.room.time * 1000);
	$data._tTime = addInterval(turnGoing, TICK);
	playBGM('rain');
};

$lib.Sansung.onWord = function (data) {
	var laneX = Math.floor(Math.random() * 74) + 3;
	var $word = $('<div>').addClass('ss-word').text(data.word)
		.css({ left: laneX + '%', top: '-10%', transition: 'none' })
		.appendTo($stage.game.display);

	addTimeout(function () {
		$word.css({ transition: 'top ' + data.fallDuration + 'ms linear', top: '110%' });
	}, 20);

	$lib.Sansung._words[data.wordId] = { $el: $word };
	playSound('mission');
};

$lib.Sansung.turnEnd = function (id, data) {
	var wObj;

	// 라운드 종료 신호 (wordId 없음) - 단어만 정리, ss-skin은 clearBoard가 처리
	if (!data.ok && data.wordId === undefined) {
		clearInterval($data._tTime);
		$.each($lib.Sansung._words, function (wId, w) { if (w.$el) w.$el.remove(); });
		$lib.Sansung._words = {};
		return;
	}

	wObj = $lib.Sansung._words[data.wordId];

	// 바닥 도달(실패): fail.mp3
	if (!data.ok) {
		if (wObj) { wObj.$el.remove(); delete $lib.Sansung._words[data.wordId]; }
		playSound('fail');
		return;
	}

	// 정답: success.mp3
	if (wObj) {
		var $el = wObj.$el;
		$el.css({ transition: 'none', top: $el.position().top + 'px' });
		$el.addClass('ss-hit');
		addTimeout(function () { $el.remove(); }, 380);
		delete $lib.Sansung._words[data.wordId];
	}

	if (data.scores) {
		$('#ss-score').text('점수: ' + (data.scores[$data.id] || 0));
		if (String(data.playerId) === String($data.id)) {
			var $p = $('<div>').addClass('ss-popup').text('+' + data.score)
				.appendTo($stage.game.display);
			addTimeout(function () { $p.remove(); }, 900);
		}
		if (data.playerId) {
			var o = $data.users[data.playerId] || $data.robots[data.playerId];
			if (o) { o.game.score = data.scores[data.playerId]; updateScore(data.playerId, o.game.score); }
		}
		playSound('success');
	}
};

// rain BGM 안 끊는 turnGoing (Jaqwi 것은 10초 남으면 BGM 바꿔버림)
$lib.Sansung.turnGoing = function () {
	var $rtb = $stage.game.roundBar;
	if (!$data.room) { clearInterval($data._tTime); return; }
	$data._roundTime -= TICK;
	var tt = $data._spectate ? L['stat_spectate'] : ($data._roundTime * 0.001).toFixed(1) + L['SECOND'];
	$rtb.width($data._roundTime / $data.room.time * 0.1 + '%').html(tt);
};

$lib.Sansung.turnHint = function () {};