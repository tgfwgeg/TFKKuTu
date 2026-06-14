/**
 * rule_sansung.js
 * 산성비 게임 클라이언트 룰
 * 경로: Server/lib/Web/lib/kkutu/rule_sansung.js
 */

// $lib.Sansung 에 등록될 함수들
$lib.Sansung = (function () {

    // ── 내부 상태 ──────────────────────────────────────
    var _active  = false;
    var _words   = {};   // id → { $el, word }
    var _$area   = null; // 낙하 컨테이너
    var _$board  = null; // 점수판

    // ── CSS (최초 1회 삽입) ─────────────────────────────
    if (!document.getElementById("ss-style")) {
        var _css = [
            "#ss-area{",
            "position:absolute;top:0;left:0;width:100%;height:100%;",
            "overflow:hidden;pointer-events:none;z-index:15;",
            "}",
            ".ss-word{",
            "position:absolute;",
            "background:linear-gradient(135deg,#1a2a6c,#2d6a4f);",
                "color:#fff;font-size:18px;font-weight:bold;",
                "padding:5px 14px;border-radius:8px;white-space:nowrap;",
                "border:1.5px solid #00c9ff88;",
                "box-shadow:0 2px 8px rgba(0,0,0,.5);",
                "animation:ss-fall linear forwards;",
                "}",
                ".ss-word.ss-hit{",
                "background:linear-gradient(135deg,#11998e,#38ef7d)!important;",
                "border-color:#38ef7d!important;",
                "animation:ss-hit .38s ease-out forwards!important;",
                "}",
                ".ss-word.ss-miss{",
                "background:linear-gradient(135deg,#c0392b,#8e44ad)!important;",
                "border-color:#e74c3c!important;",
                "animation:ss-miss .42s ease-in forwards!important;",
                "}",
                "@keyframes ss-fall{from{top:-55px}to{top:105%}}",
                "@keyframes ss-hit{",
                "0%{opacity:1;transform:scale(1.2)}",
                "100%{opacity:0;transform:scale(.55) translateY(-25px)}",
                "}",
                "@keyframes ss-miss{",
                "0%{opacity:1}",
                "100%{opacity:0;transform:scale(1.3) translateY(20px)}",
                "}",
                "#ss-board{",
                "position:absolute;top:8px;right:10px;",
                "background:rgba(0,0,0,.65);color:#fff;",
                "padding:8px 16px;border-radius:10px;",
                "font-size:14px;z-index:20;min-width:120px;",
                "pointer-events:none;",
                "}",
                ".ss-popup{",
                "font-weight:bold;font-size:15px;",
                "animation:ss-pop .9s ease-out forwards;",
                "}",
                ".ss-pos{color:#38ef7d;}",
                ".ss-neg{color:#e74c3c;}",
                "@keyframes ss-pop{",
                "0%{opacity:1;transform:translateY(0)}",
                "100%{opacity:0;transform:translateY(-22px)}",
                "}"
        ].join("");
        $("<style id='ss-style'>").text(_css).appendTo("head");
    }

    // ── 내부 유틸 ──────────────────────────────────────
    function _gameArea() {
        // KKuTu 의 .GameBox 안에 삽입
        return $(".GameBox").length ? $(".GameBox") : $("body");
    }

    function _updateScore(scores) {
        if (!_$board || !scores) return;
        var myScore = scores[$data.id] || 0;
        _$board.find("#ss-my-score").html("점수: <b>" + myScore + "</b>");
    }

    function _popup(text, isPos) {
        if (!_$board) return;
        var $p = $("<div>")
        .addClass("ss-popup " + (isPos ? "ss-pos" : "ss-neg"))
        .text(text)
        .appendTo(_$board);
        addTimeout(function () { $p.remove(); }, 900);
    }

    // ── 공개 API ──────────────────────────────────────
    return {

        // 게임 시작 시 호출
        roundReady: function (data) {
            _active = true;
            _words  = {};

            var $ga = _gameArea();
            _$area  = $("<div id='ss-area'>").appendTo($ga);
            _$board = $("<div id='ss-board'><span id='ss-my-score'>점수: <b>0</b></span></div>")
            .appendTo($ga);
        },

        // 단어 등장 (서버: sansung-spawn)
        spawn: function (data) {
            if (!_active || !_$area) return;

            var xPct = Math.floor(Math.random() * 72) + 8; // 8%~80%
            var $el = $("<div>")
            .addClass("ss-word")
            .text(data.word)
            .css({
                left:              xPct + "%",
                animationDuration: (data.fallDuration / 1000).toFixed(2) + "s"
            })
            .appendTo(_$area);

            _words[data.id] = { $el: $el, word: data.word };
            playSound("mission"); // 등장음
        },

        // 정답 (서버: sansung-hit)
        hit: function (data) {
            if (!_active) return;

            var entry = _words[data.id];
            if (entry) {
                entry.$el.addClass("ss-hit");
                addTimeout(function () { entry.$el.remove(); }, 400);
                delete _words[data.id];
            }

            _updateScore(data.scores);

            if (String(data.playerId) === String($data.id)) {
                _popup("+" + data.score, true);
            }

            playSound("missing"); // 정답음
        },

        // 놓침 (서버: sansung-miss)
        miss: function (data) {
            if (!_active) return;

            var entry = _words[data.id];
            if (entry) {
                entry.$el.addClass("ss-miss");
                addTimeout(function () { entry.$el.remove(); }, 450);
                delete _words[data.id];
            }

            _updateScore(data.scores);
            _popup("-" + data.penalty, false);
            playSound("horr"); // 실패음
        },

        // 게임 종료 (서버: sansung-end)
        end: function (data) {
            _updateScore(data.scores);
            _active = false;
            addTimeout(function () {
                if (_$area)  { _$area.remove();  _$area  = null; }
                if (_$board) { _$board.remove(); _$board = null; }
                _words = {};
            }, 1200);
        }
    };
}());
