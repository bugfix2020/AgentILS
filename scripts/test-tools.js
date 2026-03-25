import { spawn } from 'child_process';
const child = spawn('node', ['dist/index.js']);
let id = 1;
child.stdout.on('data', (data) => {
  const msgs = data.toString().split('\n').filter(Boolean);
  for (const m of msgs) {
    try {
      const obj = JSON.parse(m);
      if (obj.id === 1 && obj.result && obj.result.tools) {
        console.log(`\n============================= \n Real Tool Count: ${obj.result.tools.length} \n=============================\n`);
        obj.result.tools.forEach(t => console.log(' - ' + t.name));
        process.exit(0);
      }
    } catch(e) {}
  }
});
const req = { jsonrpc: '2.0', id: id++, method: 'tools/list', params: {} };
child.stdin.write(JSON.stringify(req) + '\n');
setTimeout(() => { console.log('Timeout'); process.exit(1); }, 2000);
