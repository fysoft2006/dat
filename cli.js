#!/usr/bin/env node
var fs = require('fs')
var singleLineLog = require('single-line-log')
var prettyBytes = require('pretty-bytes')
var dat = require('./index.js')
var usage = require('./usage')
var args = require('minimist')(process.argv.splice(2))

function noop () {}

var cmd = args._[0]
var logger = getLogger()
runCommand()

function runCommand () {
  var loc = args.path || process.cwd()
  fs.exists(loc, function (exists) {
    if (!exists) {
      logger.error('Does not exist:', loc)
      return usage('root.txt')
    }

    var db = dat({home: args.home})

    if (cmd === 'link') link(loc, db)
    else if (cmd === 'list') list(loc, db)
    else if (cmd) download(loc, db)
    else return usage('root.txt')
  })
}

function link (loc, db) {
  var dirs = args._.slice(1)
  if (dirs.length === 0) dirs = loc
  var statsScan = db.fileStats(dirs, function (err, stats) {
    if (err) throw err
    printScanProgress(stats)
    clearInterval(scanInterval)
    if (!args.json && !args.j) logger.error() // newline
    var statsAdd = db.addFiles(dirs, function (err, link) {
      printAddProgress(statsAdd, statsScan.files)
      clearInterval(addInterval)
      if (err) throw err
      db.joinTcpSwarm(link, function (_err, swarm) {
        printShareLink(swarm)
        seedSwarm(swarm)
      })
    })

    var addInterval = setInterval(function () {
      printAddProgress(statsAdd, statsScan.files)
    }, 100)
  })

  var scanInterval = setInterval(function () {
    printScanProgress(statsScan)
  }, 100)
}

function list (loc, db) {
  db = dat({home: args.home})
  db.drive._links.createValueStream().on('data', function (o) {
    logger.log(o)
  })
}

function download (loc, db) {
  // download/share
  var hash = args._[0]
  if (!hash) return usage('root.txt')
  var downloadStats = db.download(hash, loc, function (err, swarm) {
    if (err) throw err
    printDownloadStats(downloadStats)
    clearInterval(downloadInterval)
    printDownloadFinish()
    seedSwarm(swarm)
  })
  printDownloadStats(downloadStats)
  var downloadInterval = setInterval(function () {
    printDownloadStats(downloadStats)
  }, 100)
}

function seedSwarm (swarm) {
  var swarmInterval = setInterval(function () {
    printSwarmStats(swarm)
  }, 500)
  printSwarmStats(swarm)

  // intercept ctrl+c and do graceful exit
  process.on('SIGINT', function () {
    clearInterval(swarmInterval)
    swarm.close(function (err) {
      if (err) throw err
      else process.exit(0)
    })
  })
}

function printScanProgress (stats) {
  if (args.json || args.j) return logger.log(JSON.stringify(stats))
  logger.stderr(
    'Creating share link for ' + stats.files + ' files in ' +
    stats.directories + ' directories.' +
    (stats.size ? ' ' + prettyBytes(stats.size) + ' total.' : '')
  )
}

function printAddProgress (stats, total) {
  if (args.json || args.j) return logger.log(JSON.stringify(stats))
  logger.stderr('Fingerprinting files... (' + stats.files + '/' + total + ')')
}

function printSwarmStats (swarm) {
  var count = swarm.connections.sockets.length
  if (args.json || args.j) return logger.log(JSON.stringify({connections: count}))
  logger.stderr('Serving data (' + count + ' connection(s))\n')
}

function printDownloadStats (stats) {
  if (args.json || args.j) return logger.log(JSON.stringify(stats))
  var msg = 'Downloading'
  if (stats.files && stats.blocks) msg += ' file ' + (stats.files + stats.directories) + '/' + stats.blocks
  logger.stderr(msg + '\n')
}

function printDownloadFinish () {
  if (args.json || args.j) return logger.log(JSON.stringify({done: true}))
  logger.log('Done downloading.\n')
}

function printShareLink (swarm) {
  var link = 'dat://' + swarm.link
  if (args.json || args.j) return logger.log(JSON.stringify({link: link}))
  logger.stderr('') // clear previous stderr
  logger.stdout(link)
  logger.error() // final newline
}

function getLogger () {
  if (args.quiet || args.q) {
    return {
      stderr: noop,
      stdout: noop,
      log: noop,
      error: noop
    }
  }

  if (args.lognormal) {
    return {
      stderr: console.error.bind(console),
      stdout: console.log.bind(console),
      log: console.error.bind(console),
      error: console.log.bind(console)
    }
  }

  return {
    stderr: singleLineLog.stderr,
    stdout: singleLineLog.stdout,
    log: console.log.bind(console),
    error: console.error.bind(console)
  }
}
