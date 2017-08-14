const shell = require("shelljs");
const chalk = require("chalk");
const path = require("path");

// const minimist = require("minimist");

const blacklist = [
  "^s*$",
  '^"}]',
  "Unknown property",
  "Error in parsing value",
  "Unknown pseudo-class",
  "unreachable code",
  "runtests\\.py",
  "MochitestServer",
  "Main app process",
  "launched child process",
  "zombiecheck",
  "Stopping web server",
  "Stopping web socket server",
  "Stopping ssltunnel",
  "leakcheck",
  "Buffered messages",
  "Browser Chrome Test Summary",
  "Buffered messages finished",
  "CFMessagePort",
  "Completed ShutdownLeaks",
  "SUITE-END",
  "failed to bind",
  "Use of nsIFile in content process is deprecated.",
  "could not create service for entry 'OSX Speech Synth'",
  "The character encoding of the HTML document was not declared.",
  "This site appears to use a scroll-linked positioning effect",
  "Entering test bound",
  "Shutting down...",
  "Leaving test bound",
  "MEMORY STAT",
  "TELEMETRY PING",
  "started process",
  "bootstrap_defs.h",
  "Listening on port",
  "Removing tab.",
  "Tab removed and finished closing",
  "TabClose",
  "checking window state",
  "Opening the toolbox",
  "Toolbox opened and focused",
  "Tab added and finished loading"
];

let mode = "starting";

function sanitizeLine(line) {
  return line.trim().replace(/\\"/g, '"').replace(/\\"/g, '"');
}

function onGecko(line) {
  const [, msg] = line.match(/^GECKO.*?\|(.*)$/);

  if (mode == "starting") {
    return;
  }

  if (line.match(/\*{5,}/)) {
    mode = mode == "stack" ? null : "stack";
    if (mode == "stack") {
      return `   ${chalk.red("Stack Trace")}`;
    }
    return;
  }

  if (mode == "stack") {
    return `   > ${msg}`;
  }

  return msg;
}

function onLine(line) {
  line = sanitizeLine(line);
  if (line.match(new RegExp(`(${blacklist.join("|")})`))) {
    return;
  }

  if (mode == "done") {
    return;
  }

  if (line.match(/TEST-/)) {
    return onTestInfo(line);
  }

  if (line.match(/INFO/)) {
    return onInfo(line);
  }

  if (line.match(/GECKO\(/)) {
    return onGecko(line);
  }

  if (line.match(/Console message/)) {
    return onConsole(line);
  }

  if (line.includes("End BrowserChrome Test Results")) {
    mode = "done";
    return;
  }

  if (mode != "starting") {
    return `${line}`;
  }
}

function onTestInfo(line) {
  const res = line.match(/(TEST-[A-Z-]*).* \| (.*\.js)( \| (.*))?$/);

  if (!res) {
    return line.trim();
  }

  const [, type, _path, , msg] = res;

  if (type == "TEST-PASS") {
    return ` ${chalk.cyan(type)} ${msg}`;
  }

  const file = path.basename(_path);

  if (type == "TEST-UNEXPECTED-FAIL") {
    return `  ${chalk.red(type)} ${file} - ${msg}`;
  }

  let prefix = type == "TEST-OK" ? chalk.green(type) : chalk.blue(type);

  return `  ${prefix} ${file}`;
}

function onInfo(line) {
  const [, msg] = line.match(/.*INFO(.*)$/);

  if (msg.includes("Start BrowserChrome Test Results") && mode == "starting") {
    mode = null;
    return;
  }

  if (mode == "starting") {
    return;
  }

  if (line.match(/(Passed|Failed|Todo|Mode|Shutdown)/)) {
    return;
  }

  return `  ${msg}`;
}

function onConsole(line) {
  if (line.match(/JavaScript Warning/)) {
    const res = line.match(/^.*JavaScript Warning: (.*)$/);
    if (!res) {
      return line;
    }

    const [, msg, data] = res;

    const err = data;
    return `  ${chalk.red("JS warning: ")}${msg}`;
  }

  return line; //
}

function readOutput(text) {
  const out = text.split("\n").map(line => onLine(line)).filter(i => i);
  return out;
}

async function startWebpack() {
  console.log(chalk.blue("Starting webpack"));

  const command = path.resolve(__dirname, "copy-assets.js");
  const child = shell.exec(`node ${command} --watch --symlink`, {
    async: true,
    silent: true
  });

  return new Promise(resolve => {
    child.on.stdout(data => {
      const isDone = data.includes("done");
      if (isDone) {
        console.log(chalk.blue("webpack is done building"));
        resolve();
      }
    });
  });
}

function runMochitests(args) {
  shell.cd("firefox");
  const command = `./mach mochitest ${args.join(" ")}`;
  console.log(chalk.blue(command));

  const child = shell.exec(command, {
    async: true,
    silent: true
  });

  child.stdout.on("data", function(data) {
    data = data.trim();
    const lines = data.split("\n").forEach(line => {
      const out = onLine(line.trim());
      if (out) {
        console.log(out);
      }
    });
  });
}

async function run(args) {
  if (!shell.test("-d", "firefox")) {
    const url = `https://github.com/devtools-html/debugger.html/blob/master/docs/mochitests.md`;
    console.log(
      chalk.red("Oops"),
      `looks like Firefox does not exist.\nVisit our setup instructions: ${url}`
    );
    return;
  }

  // TODO: it would be nice to automate the full workflow so users can
  // run one test and then be able to kill the run and re-run. kinda like jest --watch
  // await startWebpack()

  runMochitests(args);
}

if (process.mainModule.filename.includes("bin/mochi.js")) {
  let args = process.argv[0].includes("bin/node")
    ? process.argv.slice(2)
    : process.argv;

  if (args.length == 0) {
    args = ["devtools/client/debugger/new"];
  }

  run(args);
}

module.exports = { run, readOutput };