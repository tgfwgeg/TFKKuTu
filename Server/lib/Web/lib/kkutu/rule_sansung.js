/**
 * Rule the words! KKuTu Online
 * 산성비 (KSB) 클라이언트 룰
 * 경로: Server/lib/Web/lib/kkutu/rule_sansung.js
 */

// ── CSS ──────────────────────────────────────────────
(function () {
	if (document.getElementById('ss-style')) return;
	var css = [
		/* display 영역 자체를 flex로 가운데 정렬 */
		'.jjo-display:has(#ss-wrap){',
			'display:flex;',
			'align-items:flex-start;',
			'justify-content:center;',
			'background:transparent !important;',
			'width:640px !important;',
			'height:480px !important;',
		'}',

		/* 캔버스 래퍼 */
		'#ss-wrap{',
			'position:relative;',
			'width:600px;',
			'height:450px;',
			'background:rgba(0,0,0,0.6);',
			'border-radius:12px;',
			'overflow:hidden;',
			'flex-shrink:0;',
		'}',

		/* 낙하 단어 */
		'.ss-word{',
			'position:absolute;',
			'background:linear-gradient(135deg,#1a2a6c,#2d6a4f);',
			'color:#fff;font-size:17px;font-weight:bold;',
			'padding:4px 13px;border-radius:8px;white-space:nowrap;',
			'border:1.5px solid #00c9ff88;',
			'box-shadow:0 2px 8px rgba(0,0,0,.5);',
			'transition:top linear;',
			'pointer-events:none;',
		'}',

		/* 정답 애니메이션 */
		'.ss-word.ss-hit{',
			'transition:none !important;',
			'animation:ss-hit .38s ease-out forwards;',
		'}',
		'@keyframes ss-hit{',
			'0%{opacity:1;transform:scale(1.2)}',
			'100%{opacity:0;transform:scale(.55) translateY(-25px)}',
		'}',

		/* 점수판 */
		'#ss-score{',
			'position:absolute;top:8px;right:10px;',
			'background:rgba(0,0,0,.75);color:#fff;',
			'padding:5px 12px;border-radius:7px;',
			'font-size:14px;font-weight:bold;',
			'z-index:20;pointer-events:none;',
		'}',

		/* 점수 팝업 */
		'.ss-popup{',
			'position:absolute;right:14px;top:34px;',
			'font-weight:bold;font-size:15px;color:#38ef7d;',
			'animation:ss-pop .9s ease-out forwards;',
			'pointer-events:none;z-index:21;',
		'}',
		'@keyframes ss-pop{',
			'0%{opacity:1;transform:translateY(0)}',
			'100%{opacity:0;transform:translateY(-24px)}',
		'}',

		/* 모레미(캐릭터 이미지) 숨기기 */
		'#ss-active .game-user-image,',
		'#ss-active .moremi{ display:none !important; }',
		'#ss-active .game-user-title{ margin-left:0 !important; }'
	].join('');
	$('<style id="ss-style">').text(css).appendTo('head');
}());

// ── 내부 상태 ─────────────────────────────────────────
$lib.Sansung._words  = {};
$lib.Sansung._$wrap  = null;
$lib.Sansung._$score = null;

// ── roundReady ────────────────────────────────────────
$lib.Sansung.roundReady = function (data, spec) {
	clearBoard();
	$data._relay     = true;
	$data._roundTime = $data.room.time * 1000;
	$data._fastTime  = 10000;

	$lib.Sansung._words = {};

	// cw 클래스로 넓은 화면 사용
	$('.jjoriping,.rounds,.game-body').addClass('cw');

	// 모레미 숨기기용 id 마킹
	$('.game-body').attr('id', 'ss-active');

	$stage.game.items.hide();
	$stage.game.hints.hide();
	$stage.game.cwcmd.hide();
	$stage.game.bb.hide();
	$stage.game.here.hide();

	// 캔버스 래퍼 생성 (display 안, CSS flex로 자동 가운데)
	$stage.game.display.empty();
	$lib.Sansung._$wrap  = $('<div id="ss-wrap">').appendTo($stage.game.display);
	$lib.Sansung._$score = $('<div id="ss-score">점수: 0</div>')
		.appendTo($lib.Sansung._$wrap);

	drawRound(data.round);
	if (!spec) playSound('round_start');
	clearInterval($data._tTime);
};

// ── turnStart ─────────────────────────────────────────
$lib.Sansung.turnStart = function (data) {
	clearInterval($data._tTime);
	$data._roundTime = data.roundTime || ($data.room.time * 1000);
	$data._tTime = addInterval(turnGoing, TICK);

	// 게임 BGM: rain.mp3
	playBGM('rain');
};

$lib.Sansung.turnGoing = function(){
	var $rtb = $stage.game.roundBar;
	var bRate;
	var tt;
	var speedLevel;

	if(!$data.room) clearInterval($data._tTime);
	$data._roundTime -= TICK;

	tt = $data._spectate ? L['stat_spectate'] : ($data._roundTime*0.001).toFixed(1) + L['SECOND'];
	$rtb
		.width($data._roundTime/$data.room.time*0.1 + "%")
		.html(tt);

	// 단어 낙하 속도 동적 조정
	if($data._roundTime <= 10000) speedLevel = 5;      // 겁나 빠르게
	else if($data._roundTime <= 30000) speedLevel = 4; // 좀 빠르게
	else if($data._roundTime <= 60000) speedLevel = 3; // 보통
	else if($data._roundTime <= 90000) speedLevel = 2; // 진짜 조금 느리게
	else if($data._roundTime <= 120000) speedLevel = 1;// 조금 느리게
	else speedLevel = 0;                               // 느리게

	$data._rainSpeed = speedLevel;
};

// ── 단어 등장 (서버: sansung-word) ────────────────────
$lib.Sansung.onWord = function (data) {
	if (!$lib.Sansung._$wrap) return;

	var wordId  = data.wordId;
	var word    = data.word;
	var timeout = data.fallDuration;
	var laneX   = Math.floor(Math.random() * 70) + 5; // 5%~75%

	// 속도 조정 (0~5 단계)
	var speedLevel = $data._rainSpeed || 3;
	var speedMult = [1.0, 0.85, 0.7, 1.0, 1.3, 1.6][speedLevel];
	timeout = Math.floor(timeout / speedMult);

	var $word = $('<div>')
		.addClass('ss-word')
		.text(word)
		.css({ left: laneX + '%', top: '-8%', transition: 'none' })
		.appendTo($lib.Sansung._$wrap);

	// 1프레임 후 transition 시작
	addTimeout(function () {
		$word.css({
			transition: 'top ' + timeout + 'ms linear',
			top: '108%'
		});
	}, 20);

	$lib.Sansung._words[wordId] = {
		$el: $word, createdAt: Date.now(), timeout: timeout
	};

	// 단어 등장 시: mission.mp3
	playSound('mission');
};

// ── turnEnd ───────────────────────────────────────────
$lib.Sansung.turnEnd = function (id, data) {
	var wObj, $el;

	// 라운드 종료 (wordId 없음)
	if (!data.ok && data.wordId === undefined) {
		$data._relay = false;
		clearInterval($data._tTime);
		stopBGM();

		// 남은 단어 전부 제거
		$.each($lib.Sansung._words, function (wId, w) { if (w.$el) w.$el.remove(); });
		$lib.Sansung._words = {};

		// 래퍼 제거
		if ($lib.Sansung._$wrap) {
			$lib.Sansung._$wrap.remove();
			$lib.Sansung._$wrap  = null;
			$lib.Sansung._$score = null;
		}

		// 모레미 숨김 해제 (결과창에 캐릭터 다시 표시)
		$('.game-body').removeAttr('id');

		playSound('horr');
		return;
	}

	wObj = $lib.Sansung._words[data.wordId];

	// 바닥 도달 (놓침): fail.mp3
	if (!data.ok) {
		if (wObj) { wObj.$el.remove(); delete $lib.Sansung._words[data.wordId]; }
		playSound('fail');
		return;
	}

	// 정답: success.mp3
	if (wObj) {
		$el = wObj.$el;
		$el.css({ transition: 'none', top: $el.position().top + 'px' });
		$el.addClass('ss-hit');
		addTimeout(function () { $el.remove(); }, 400);
		delete $lib.Sansung._words[data.wordId];
	}

	if (data.scores) {
		var myScore = data.scores[$data.id] || 0;
		if ($lib.Sansung._$score) $lib.Sansung._$score.text('점수: ' + myScore);

		// 내가 맞췄을 때만 팝업
		if (String(data.playerId) === String($data.id) && $lib.Sansung._$wrap) {
			var $p = $('<div>').addClass('ss-popup').text('+' + data.score)
				.appendTo($lib.Sansung._$wrap);
			addTimeout(function () { $p.remove(); }, 900);
		}

		// 점수판 반영
		if (data.playerId) {
			var o = $data.users[data.playerId] || $data.robots[data.playerId];
			if (o) {
				o.game.score = data.scores[data.playerId];
				updateScore(data.playerId, o.game.score);
			}
		}
		playSound('success');
	}
};

$lib.Sansung.turnHint  = function () {};