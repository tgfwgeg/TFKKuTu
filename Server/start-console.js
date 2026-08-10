const Runner = require('./runner.js');

Runner.send = (...argv) => {
	const [channel, ...rest] = argv;
	switch (channel) {
		case 'log':
			// argv: ['log', 'n'|'e', message]
			process.stdout.write(String(rest[1]));
			break;
		case 'server-status':
			console.log(`[상태] server-status = ${rest[0]}`);
			break;
		case 'alert':
			console.log(`[알림]\n${rest[0]}`);
			break;
		default:
			console.log(`[send:${channel}]`, ...rest);
	}
};

console.log('서버를 시작합니다.');
Runner.run('server-on');

process.on('SIGINT', () => {
	console.log('\n서버를 종료합니다.');
	Runner.run('server-off');
	process.exit(0);
});
