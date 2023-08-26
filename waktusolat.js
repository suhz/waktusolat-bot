var http = require('http')
var https = require('https')
var querystring = require('querystring')
var mysql = require('mysql')
var bodyParser = require('body-parser')
var parser = require('xml2json')
var express = require('express')
var app = express()
var moment = require('moment-timezone')
var cron = require('node-schedule')

var senarai_cron = []

var pool = mysql.createPool({
  host: 'localhost',
  user: 'waktusolat',
  password: 'waktusolat',
  database: 'waktusolat'
})

app.use(bodyParser.json())
// app.use(bodyParser.urlencoded({ extended: false }))

var setKawasanChannel2 = function (channel_id, kawasan, callback) {
  var q = "select * from `zon` where `description` LIKE '%" + kawasan + "%' OR `negeri` LIKE '%" + kawasan + "%' OR `zon` LIKE '%" + kawasan + "%'"
  // var q = "SELECT * FROM zon WHERE MATCH (description) AGAINST ('" + kawasan + "') OR `negeri` LIKE '%" + kawasan + "%' OR `zon` LIKE '%" + kawasan + "%' ORDER BY description ASC"

  pool.getConnection(function (err, connection) {
    connection.query(q, function (err, rows) {
      if (!err && rows.length > 0) {
        // kalau result lebih dari satu
        if (rows.length > 1) {
          var num = 1
          var ret_arr = []
          var ret_list = '\n\r\n\r'
          for (var i = 0; i < rows.length; i++) {
            ret_list += num + '. ' + rows[i].zon + ': ' + rows[i].negeri + ', ' + rows[i].description + '\n\r'
            ret_arr.push([rows[i].description])
            num++
          }

          var ret = {
            'msg': 'Saya jumpa lebih dari satu kawasan untuk ' + kawasan + '.' + ret_list + '\n\r\n\r' + 'Sila pilih salah satu:',
            'result': ret_arr
          }

          callback({'err': ret})
        } else {


          if (rows[0].zon == 'SGR03') {
            var msg = 'Sila join channel @waktusolat_kl untuk mendapatkan notifikasi waktu solat untuk kawasan Kuala Lumpur atau klik pada link ini dan JOIN - https://telegram.me/waktusolat_kl';

            var ret = {
              'msg': msg,
              'result': false
            }

            callback({'err': ret})
          } else {
            var q = "select * from `channel` where `channel_id` = '" + channel_id + "' LIMIT 1"

            connection.query(q, function (err, row) {
              if (row.length > 0) {
                if (kawasan.length > 15) {
                  kawasan = rows[0].zon
                }
                var q = "UPDATE channel SET zon = '" + rows[0].zon + "',kawasan = '" + kawasan + "' WHERE channel_id='" + channel_id + "' LIMIT 1"
                connection.query(q, function (err) {
                  if (!err) {
                    callback('OK')
                    connection.release()
                  }
                })
              } else {
                q = 'INSERT INTO channel (channel_id, kawasan, zon)' +
                " VALUES ('" + channel_id + "','" + kawasan + "', '" + rows[0].zon + "')"

                connection.query(q, function (err) {
                  if (!err) {
                    callback('OK')
                    connection.release()
                  }
                })
              }
            })
          }

        }
      } else {
        callback({'err': 'Maaf, Saya tidak jumpa kawasan tu, sila cuba kawasan yang berhampiran atau negeri.'})
        connection.release()
      }
    })
  })
}

var fetchWaktuSolat = function (zon, callback) {
  console.log('Fetching latest waktu solat XML.. ' + zon)
  // var api_url = "http://www2.e-solat.gov.my/xml/today/index.php?zon=";
  var api_url = "http://api.kayrules.com/solatjakim/times/today.json?format=24-hour&zone=";
  http.get(api_url + zon, function (res) {
    res.setEncoding('utf8')

    var body = ''
    res.on('data', function (chunk) {
      body += chunk
    })

    res.on('end', function () {
      //body = JSON.parse(parser.toJson(body))
      body = JSON.parse(body)

      //if (typeof body.rss.channel.item !== 'undefined') {
      if (typeof body.zone !== 'undefined') {
        callback(ret = {
          'zon': zon,
          'description': body.locations.join(),
          'waktu': {
            'imsak': body.prayer_times.imsak,
            'subuh': body.prayer_times.subuh,
            'syuruk': body.prayer_times.syuruk,
            'zohor': body.prayer_times.zohor,
            'asar': body.prayer_times.asar,
            'maghrib': body.prayer_times.maghrib,
            'isyak': body.prayer_times.isyak
          }
        })
      } else {
        console.log('error, zon tidak wujud!')
      }
    })
  })
}

var getChannelKawasan = function (channel_id, callback) {
  var q = "select * from `channel` where `channel_id` ='" + channel_id + "'"

  pool.getConnection(function (err, connection) {
    connection.query(q, function (err, rows) {
      connection.release()

      if (!err && rows.length !== 0) {
        callback(rows[0].zon, rows[0].kawasan)
      } else {
        callback(false)
      }
    })
  })
}

var runQuery = function (query, callback) {
  pool.getConnection(function (err, connection) {
    connection.query(query, function (err, rows) {
      connection.release()

      if (typeof callback === 'function') {
        callback(err, rows)
      }
    })
  })
}

var delChannelKawasan = function (channel_id, callback) {
  var q = "DELETE FROM `channel` where `channel_id` ='" + channel_id + "'"

  runQuery(q, function (err, row) {
    if (typeof callback === 'function') {
      callback(err)
    }
  })
}

var cariIkutKawasan = function (kw, callback) {
  // console.log('KW: ' + kw)

  var q = "select * from `zon` where `description` LIKE '%" + kw + "%' OR `negeri` LIKE '%" + kw + "%' OR `zon` LIKE '%" + kw + "%'"
  // var q = "SELECT * FROM zon WHERE MATCH (description) AGAINST ('" + kw + "') OR `negeri` LIKE '%" + kw + "%' OR `zon` LIKE '%" + kw + "%' ORDER BY description ASC"

  pool.getConnection(function (err, connection) {
    connection.query(q, function (err, rows) {
      if (!err && rows.length > 0) {
        // kalau result lebih dari satu
        if (rows.length > 1) {
          var num = 1
          var ret = 'Keputusan carian anda mempunyai lebih dari satu kawasan' + '\n\r\n\r'
          ret += 'KOD - KAWASAN' + '\n\r'
          for (var i = 0; i < rows.length; i++) {
            ret += rows[i].zon + ' - ' + rows[i].negeri + ', ' + rows[i].description + '\n\r'
            num++
          }
          ret += 'sila gunakan kata kunci yang lebih spesifik.'
          callback({'err': ret})
        } else {
          var q = "select * from `waktu` where `zon` = '" + rows[0].zon + "'"

          connection.query(q, function (err, row) {
            if (!err) {
              var s = moment(row[0].last_update)
              var e = moment()
              var diff = e.diff(s, 'hours')

              if (diff >= 12) {
                fetchWaktuSolat(rows[0].zon, function (d) {
                  var q = 'UPDATE waktu ' +
                  "SET imsak='" + d.waktu.imsak + "', subuh='" + d.waktu.subuh + "', syuruk='" + d.waktu.syuruk + "', zohor='" + d.waktu.zohor + "', asar='" + d.waktu.asar + "', maghrib='" + d.waktu.maghrib + "', isyak='" + d.waktu.isyak + "' " +
                  ",last_update='" + moment().format('YYYY-M-DD HH:mm:ss') + "' WHERE zon = '" + rows[0].zon + "'"

                  connection.query(q, function (err) {
                    if (!err) {
                      connection.release()
                    }
                  })
                  d = { 'kawasan': rows[0].description, 'waktu': d.waktu }
                  callback(d)
                })
              } else {
                connection.release()
                var d = { 'kawasan': rows[0].description, 'waktu': row[0] }
                callback(d)
              }
            }
          })
        }
      } else {
        callback({'err': 'Maaf, Saya tidak jumpa kawasan tu, sila cuba kawasan yang berhampiran atau negeri.'})
        connection.release()
      }
    })
  })
}

var setKawasanChannel = function (channel_id, kawasan, callback) {
  var q = "select * from `zon` where `description` LIKE '%" + kawasan + "%' OR `negeri` LIKE '%" + kawasan + "%' OR `zon` LIKE '%" + kawasan + "%'"

  // var q = "SELECT * FROM zon WHERE MATCH (description) AGAINST ('" + kawasan + "') OR `negeri` LIKE '%" + kawasan + "%' OR `zon` LIKE '%" + kawasan + "%' ORDER BY description ASC"

  pool.getConnection(function (err, connection) {
    connection.query(q, function (err, rows) {
      if (!err && rows.length > 0) {
        // kalau result lebih dari satu
        if (rows.length > 1) {
          var num = 1
          var ret = '- Keputusan carian anda mempunyai lebih dari satu kawasan' + '\n\r\n\r'
          ret += 'KOD - KAWASAN' + '\n\r'
          for (var i = 0; i < rows.length; i++) {
            ret += rows[i].zon + ' - ' + rows[i].negeri + ', ' + rows[i].description + '\n\r'
            num++
          }
          ret += '- sila gunakan kata kunci yang lebih spesifik.'
          callback({'err': ret})
        } else {

          if (rows[0].zon == 'SGR03') {
            var msg = 'Sila join channel @waktusolat_kl untuk mendapatkan notifikasi waktu solat untuk kawasan Kuala Lumpur atau klik pada link ini dan JOIN - https://telegram.me/waktusolat_kl';

            callback({'err': msg})
          } else {
            var q = "select * from `channel` where `channel_id` = '" + channel_id + "' LIMIT 1"

            connection.query(q, function (err, row) {
              if (row.length > 0) {
                var q = "UPDATE channel SET zon = '" + rows[0].zon + "',kawasan = '" + kawasan + "' WHERE channel_id='" + channel_id + "' LIMIT 1"
                connection.query(q, function (err) {
                  if (!err) {
                    callback('OK')
                    connection.release()
                  }
                })
              } else {
                q = 'INSERT INTO channel (channel_id, kawasan, zon)' +
                " VALUES ('" + channel_id + "','" + kawasan + "', '" + rows[0].zon + "')"

                connection.query(q, function (err) {
                  if (!err) {
                    callback('OK')
                    connection.release()
                  }
                })
              }
            })
          }

        }
      } else {
        callback({'err': 'Maaf, Saya tidak jumpa kawasan tu, sila cuba kawasan yang berhampiran atau negeri.'})
        connection.release()
      }
    })
  })
}

/* var formatMasa = function (masa) {
  var masa = masa.split(':')
  return masa[0] + ':' + masa[1];
}*/

var pad = function (num, size) {
  var s = num + ''
  while (s.length < size) s = '0' + s
  return s
}

var bersihWaktu = function (waktu, str, callback) {
  // disebabkan data dari JAKIM tak konsistem, kita terpaksa check secara detail.
  var test_type = ''

  // test if guna :
  var test = str.split(':')
  if (test.length > 1) {
    test_type = ':'
  }

  // test if guna .
  test = str.split('.')
  if (test.length > 1) {
    test_type = '.'
  }

  var time = str.split(test_type)

  // AM
  if (waktu === 'imsak' || waktu === 'subuh' || waktu === 'syuruk' || waktu === 'dhuha') {
    // time = time[0] + ':' + time[1] + 'am';

    /* if (time[0] < 12 && time[0] < 2) {
      time[0] = "0" + time[0];
    }*/

    time = pad(time[0], 2) + ':' + time[1]
    callback(time, 'am')
  }

  // PM
  if (waktu === 'zohor' || waktu === 'asar' || waktu === 'maghrib' || waktu === 'isyak') {
    // time = time[0] + ':' + time[1] + 'pm';
    if (time[0] < 12) {
      time[0] = parseInt(time[0], 10) + 12
    }
    time = time[0] + ':' + time[1]
    callback(time, 'pm')
  }
}

/* var sendReminder = function (waktu, zon) {
  runQuery('SELECT * FROM channel LEFT JOIN waktu ON channel.zon = waktu.zon WHERE channel.zon =  "' + zon + '"', function (err, rows) {
    var kmasa = 0; var gomasa = 0

    for (var i = 0; i < rows.length; i++) {
      if (kmasa === 60) {
        kmasa = 0
        gomasa += 1000
      }
      kmasa++
      // if (rows[0].channel_id == '-6316248') {
      // console.log('R1: ' + rows[i].channel_id + '|' +  waktu + '|' + rows[i].kawasan)
      // sendMessage(rows[i].channel_id, 'Dalam 10 minit, akan masuk Waktu ' + waktu + ' (' + waktuRow(waktu, rows) + ') bagi kawasan ' + rows[i].kawasan + ' dan yang sewaktu dengannya.')
       // + '\n\r\n\r' + 'tips: anda boleh menerima notifikasi untuk anda sendiri, jika tidak mahu di group. Sila mesej saya (pm) dan gunakan command /setkawasan')
    }
  })
} */

var hantarMsg = function (rows, waktu) {
  for (var i = 0; i < rows.length; i++) {

    var msg = 'Telah masuk waktu ' + waktu + ' (' + waktuRow(waktu, rows) + ') bagi kawasan ' + rows[i].kawasan + ' dan yang sewaktu dengannya.';
    sendMessage(rows[i].channel_id, msg)
  }
}

var sendReminder2 = function (waktu, zon) {

  runQuery('SELECT COUNT(*) as jumlah, waktu.* FROM channel LEFT JOIN waktu ON channel.zon = waktu.zon WHERE channel.zon =  "' + zon + '"', function (err, rows) {

    if (zon == 'SGR03') {
      if (waktu == 'imsak') {
        var msg = { 'kawasan': 'Kuala Lumpur', 'waktu': rows[0] }
        msg = formatMesej(msg);
        sendMessage('@waktusolat_kl', msg);
      }

      sendMessage('@waktusolat_kl', 'Telah masuk waktu ' + waktu + ' (' + waktuRow(waktu, rows) + ') bagi kawasan Kuala Lumpur dan yang sewaktu dengannya.')

    } else if (zon == 'SGR01') {
      if (waktu == 'imsak') {
        var msg = { 'kawasan': 'Selangor Zon 1', 'waktu': rows[0] }
        msg = formatMesej(msg);
        sendMessage('@waktusolat_selangor1', msg);
      }

      sendMessage('@waktusolat_selangor1', 'Telah masuk waktu ' + waktu + ' (' + waktuRow(waktu, rows) + ') bagi kawasan Hulu Selangor, Hulu Langat, Sepang, Petaling Jaya, Shah Alam dan yang sewaktu dengannya.')
    }

    if (zon != 'SGR03') {
      var limit = 30
      var jumlah = rows[0].jumlah
      var groupSize = Math.ceil(jumlah / limit)
      var offset = 0

      for (var i = 0; i < groupSize; i++) {
        runQuery('SELECT * FROM channel LEFT JOIN waktu ON channel.zon = waktu.zon WHERE channel.zon =  "' + zon + '" LIMIT ' + offset + ', ' + limit, function (err, rows) {
          setTimeout(function () {
            hantarMsg(rows, waktu)
          }, 1500 * i)
        })
        offset += limit
      }
    }

  })

  /* runQuery('SELECT * FROM channel LEFT JOIN waktu ON channel.zon = waktu.zon WHERE channel.zon =  "' + zon + '"', function (err, rows) {

    for (var i = 0; i < rows.length; i++) {
      msgToSend[i] = rows;
      //console.log('R2:' + rows[i].channel_id + '|' +  waktu + '|' + rows[i].kawasan)
      //sendMessage(rows[i].channel_id, 'Telah masuk waktu ' + waktu + ' (' + waktuRow(waktu, rows) + ') bagi kawasan ' + rows[i].kawasan + ' dan yang sewaktu dengannya.') // + '\n\r\n\r' + 'tips: gunakan command /delkawasan untuk menghentikan notifikasi di group. Sila mesej saya (pm) untuk set notifikasi waktu solat untuk diri anda seorang sahaja :)')
    }

  })*/
}

var waktuRow = function (waktu, rows) {
  if (waktu === 'imsak') {
    return rows[0].imsak
  } else
  if (waktu === 'subuh') {
    return rows[0].subuh
  } else
  if (waktu === 'zohor') {
    return rows[0].zohor
  } else
  if (waktu === 'asar') {
    return rows[0].asar
  } else
  if (waktu === 'maghrib') {
    return rows[0].maghrib
  } else
  if (waktu === 'isyak') {
    return rows[0].isyak
  } else
  if (waktu === 'syuruk') {
    return rows[0].syuruk
  } else
  if (waktu === 'dhuha') {
    return rows[0].dhuha
  }
}

var addReminder = function (waktusolat, time, zon) {
  // DATE IN GMT+8
  var date1 = moment().tz('Asia/Kuala_Lumpur').format('YYYY-MM-DDT')
  var date2 = moment().tz('Asia/Kuala_Lumpur').format(':00.196+0800')

  bersihWaktu(waktusolat, time, function (waktu) {
    if (typeof waktu === 'undefined') {
      return
    }
    // var date3 = moment(Date.parse(date1 + waktu + date2)).subtract(10, 'minutes').format('YYYY-MM-DDTHH:mm:ss+00:00')

    // pastikan bukan tarikh dah lepas..
    var now = moment()
    var dulu = moment(Date.parse(date1 + waktu + date2))
    var beza = dulu.diff(now, 'minutes')

    if (beza > 0) {
      // console.log('add cron ' + zon + ' ' + waktu + ' ' + time + ' - ' + date1 + waktu + date2)

      /* new cron.Job(zon, function () {
        sendReminder(waktusolat, zon)
      }).schedule(new Date(date3))
      */

      senarai_cron[waktusolat + zon] = new cron.Job(zon, function () {
        sendReminder2(waktusolat, zon)
      }).schedule(new Date(date1 + waktu + date2))
    } else {
      // console.log('error add cron ' + zon + ' ' + waktu + ' ' + time + ' - ' + date1 + waktu + date2 + ' - ' + date3)
    }
  })
}

var session_lastAction = function (chat_id, callback) {
  var q_select = 'SELECT * FROM session WHERE chat_id =  "' + chat_id + '"'

  runQuery(q_select, function (err, row) {
    if (!err && row.length !== 0) {
      var now = moment()
      var last_action_time = moment(Date.parse(row[0].masa))
      var beza = last_action_time.diff(now, 'minutes')

      if (beza > 10) { // session lebih 10 minit, expired!
        callback(false)
      } else {
        callback(row[0].last_action, row[0].action_text)
      }
    } else {
      callback(false)
    }
  })
}

var session_end = function (chat_id, callback) {
  var q_delete = 'DELETE FROM session where chat_id = "' + chat_id + '"'
  runQuery(q_delete, function () {
    if (typeof callback === 'function') {
      callback()
    }
  })
}

var session_start = function (chat_id, command, cmd_text, callback) {
  var q_delete = 'DELETE FROM session where chat_id = "' + chat_id + '"'
  var q_insert = 'INSERT INTO session (`chat_id`, `last_action`, `action_text`) VALUES (' + chat_id + ', "' + command + '", "' + cmd_text + '")'

  runQuery(q_delete, function (err, row) {
    runQuery(q_insert, function (err, row) {
      callback()
    })
  })
}

function kira_waktu_dhuha(waktu, callback) {
  var subuh = waktu.subuh.split(':');
  var syuruk = waktu.syuruk.split(':');
  subuh = moment().hour(subuh[0]).minute(subuh[1]);
  syuruk = moment().hour(syuruk[0]).minute(syuruk[1]);

  var diff = syuruk.diff(subuh, 'minutes')
  var dhuha = Math.round(diff/3);
  dhuha = syuruk.add(dhuha, 'minutes');

  callback(dhuha.format('hh:mm'));
}

var update_waktu_db = function(callback) {
  console.log('- Updating Waktusolat DB -');

    runQuery('SELECT * FROM waktu', function (err, row) {
      for (var i = 0; i < row.length; i++) {

        if (typeof row[i].zon !== 'undefined') {
          var s = moment(row[i].last_update)
          var e = moment()
          var diff = e.diff(s, 'hours')

          if (diff >= 12) {
            // console.log('Updating Zone ' + row[i].zon);
            fetchWaktuSolat(row[i].zon, function(d) {

                kira_waktu_dhuha(d.waktu, function(dhuha) {
                  var q = 'UPDATE waktu ' +
                  "SET imsak='" + d.waktu.imsak + "', dhuha='" + dhuha + "', subuh='" + d.waktu.subuh + "', syuruk='" + d.waktu.syuruk + "', zohor='" + d.waktu.zohor + "', asar='" + d.waktu.asar + "', maghrib='" + d.waktu.maghrib + "', isyak='" + d.waktu.isyak + "' " +
                  ",last_update='" + moment().format('YYYY-M-DD HH:mm:ss') + "' WHERE zon = '" + d.zon + "'"

                  runQuery(q, function (err) {
                    if (!err) {
                      // console.log('> Success!');
                    } else {
                      // console.log('> Failed!');
                    }
                  })
                });
            });
          }
        }
      }

    })

}

var setupReminder = function () {
  // create job
  runQuery('SELECT DISTINCT zon FROM channel WHERE zon IS NOT NULL', function (err, rows) {
    for (var i = 0; i < rows.length; i++) {
      runQuery('SELECT * FROM waktu WHERE zon = "' + rows[i].zon + '"', function (err, rows2) {
        // Imsak
        addReminder('imsak', rows2[0].imsak, rows2[0].zon)

        // Subuh
        addReminder('subuh', rows2[0].subuh, rows2[0].zon)

        // Syuruk
        addReminder('syuruk', rows2[0].syuruk, rows2[0].zon)

        // Zohor
        addReminder('zohor', rows2[0].zohor, rows2[0].zon)

        // Asar
        addReminder('asar', rows2[0].asar, rows2[0].zon)

        // Maghrib
        addReminder('maghrib', rows2[0].maghrib, rows2[0].zon)

        // Isya
        addReminder('isyak', rows2[0].isyak, rows2[0].zon)

        // dhuha
        addReminder('dhuha', rows2[0].dhuha, rows2[0].zon)
      })
    }
  })
}

var resetReminder = function () {
  /*
  for (var key in senarai_cron) {
    if (senarai_cron.hasOwnProperty(key)) {
      senarai_cron[key].cancel()
    }
  }
  */
  update_waktu_db();
  senarai_cron = []
  setupReminder()
}

var formatMesej = function (d) {
  var timenow = moment().tz('Asia/Kuala_Lumpur').format('DD/MM/YYYY')
  var ret = 'Waktu Solat bagi ' + d.kawasan + ' utk ' + timenow + '\n\r\n\r'
  ret += 'Imsak : ' + d.waktu.imsak + ' am\n\r'
  ret += 'Subuh : ' + d.waktu.subuh + ' am\n\r'
  ret += 'Syuruk : ' + d.waktu.syuruk + ' am\n\r'
  ret += 'Dhuha : ' + d.waktu.dhuha + ' am \n\r'
  ret += 'Zohor : ' + d.waktu.zohor + ' pm \n\r'
  ret += 'Asar : ' + d.waktu.asar + ' pm \n\r'
  ret += 'Maghrib : ' + d.waktu.maghrib + ' pm \n\r'
  ret += 'Isyak : ' + d.waktu.isyak + ' pm \n\r'
  return ret
}

// cariIkutKawasan('kuala lumpur')

app.post('/', function (req, res) {
  // console.log(req.body)

  var cmd
  var cmd2 = ''
  var msg = req.body.message.text

  if (msg) {
    msg = msg.split(' ')
    for (var i = 1; i < msg.length; i++) {
      cmd2 += msg[i] + ' '
    }
  }

  if (Object.prototype.toString.call(msg) === '[object Array]') {
    cmd = msg[0]
  } else {
    cmd = msg
  }

  res.send('OK')

  var carian = cmd2.trim()
  var cmd_text = carian
  var jenis
  if (req.body.message.chat.id > 0) {
    jenis = 'anda'
  } else if (req.body.message.chat.id < 0) {
    jenis = 'group ' + req.body.message.chat.title
  }

  var tele = req.body.message

  // LOGGING START
  if (typeof tele.new_chat_participant !== 'undefined') {
    if (tele.new_chat_participant.username === 'WaktuSolat_bot') {
      // console.log(moment().format("DD MM YYYY h:mm:ss a") + ' | Added to new Group | ' + tele.chat.id + ' - ' + tele.chat.title + ' | by | ' + tele.from.first_name + ' ' + tele.from.last_name + ' (' + tele.from.id + ')')
    }
  }

  if (typeof tele.left_chat_participant !== 'undefined') {
    if (tele.left_chat_participant.username === 'WaktuSolat_bot') {
      delChannelKawasan(tele.chat.id)
      // console.log(moment().format("DD MM YYYY h:mm:ss a") + ' | Removed from Group | ' + tele.chat.id + ' - ' + tele.chat.title + ' | by | ' + tele.from.first_name + ' ' + tele.from.last_name + ' (' + tele.from.id + ')')
    }
  }

  /* if (cmd && cmd != '') {
    console.log(moment().format("DD/MM/YYYY h:mm:ss a") + ' | ' +  tele.text + ' | by | ' + tele.from.first_name + ' ' + tele.from.last_name + ' (' + tele.from.id + ')' + ' | in | ' + tele.chat.id + ' | ' + tele.chat.title )
  }*/
  // LOGGING END

  // id suhaimi, for debug
  // if (tele.chat.id == '2622041') {
  // sendMessage(tele.chat.id, 'te')

  if (cmd === '/notifikasi') {
    if (tele.chat.id > 0) {
      session_start(tele.chat.id, cmd, cmd_text, function () {
        getChannelKawasan(tele.chat.id, function (zon, kawasan) {
          if (zon !== false) {
            sendMessage_rm(tele.chat.id,
              'Notifikasi anda adalah aktif untuk kawasan ' + kawasan + ' (' + zon + ')' + '\n\r' +
              'Adakah anda ingin menghentikan notifikasi?',
                [['Kemaskini Lokasi'], ['Ya', 'Tidak']]
              )
          } else {
            sendMessage_rm(tele.chat.id,
                'Anda tidak mempunyai sebarang notifikasi yang aktif. Adakah anda ingin mengaktifkan fungsi notifikasi?',
                [['Aktifkan'], ['Tidak']]
            )
            sendMessage(tele.chat.id, '')
          }
        })
      })
    }
  } else
    if (cmd === '/waktusolat' || cmd === '/waktusolat@WaktuSolat_bot') {
      logCommand(cmd, tele)
      getChannelKawasan(req.body.message.chat.id, function (zon) {
        if (zon && carian === '') {
          carian = zon
        } else if (carian === '') {
          var m = 'Maaf ' + req.body.message.from.first_name + ', arahan salah. cth: /waktusolat Kuala Lumpur' +
                  '\n\r' + 'Atau, boleh set kawasan default utk ' + jenis + ' dengan menaip */setkawasan Kuala Lumpur*'

          sendMessage(req.body.message.chat.id, m)
          carian = ''
        }

        if (carian !== '') {
          cariIkutKawasan(carian, function (ret) {
            if (!ret.err) {
              ret = formatMesej(ret)
            } else {
              ret = ret.err
            }
            sendMessage(req.body.message.chat.id, ret)
          })
        }
      })
    } else
    if (cmd === '/info' || cmd === '/start' || cmd === '/help' || cmd === '/help@WaktuSolat_bot') {
      logCommand(cmd, tele)
      sendMessage(req.body.message.chat.id, 'Senarai arahan saya untuk semua:' + '\n\r' +
                                            '/waktusolat - papar waktu solat' + '\n\r' +
                                            '/waktusolat <tempat> - carian waktu solat' + '\n\r\n\r' +
                                            'Senarai arahan saya untuk PM sahaja:' + '\n\r' +
                                            '/notifikasi - Setting notifikasi' + '\n\r\n\r' +
                                            'Senarai arahan saya untuk Group sahaja:' + '\n\r' +
                                            '/setkawasan <tempat> - set notifikasi waktu solat' + '\n\r' +
                                            '/delkawasan - buang notifikasi waktu solat' + '\n\r\n\r' +
                                            'sebarang cadangan atau masalah email suhaimi@tbd.my')
    } else
    if (cmd === '/delkawasan') {
      logCommand(cmd, tele)
      if (tele.chat.id > 0) {
        sendMessage(tele.chat.id, 'Command ini telah ditukar, sila gunakan command /notifikasi untuk membuang notifikasi.')
      } else {
        delChannelKawasan(tele.chat.id, function () {
          sendMessage(tele.chat.id, 'Kawasan telah di buang, notifikasi waktu solat akan dimatikan.' + '\n\r' + 'untuk menerima notifikasi semula sila gunakan arahan /setkawasan')
        })
      }
    } else
    if (cmd === '/setkawasan' || cmd === '/setkawasan@WaktuSolat_bot') {
      logCommand(cmd, tele)

      if (tele.chat.id > 0) {
        sendMessage(tele.chat.id, 'Command ini telah ditukar, sila gunakan command /notifikasi untuk mengaktifkan notifikasi.')
      } else {
        if (cmd2.trim() === '') {
          sendMessage(req.body.message.chat.id, 'Maaf ' + req.body.message.from.first_name + ', arahan tak lengkap. Sila ikut seperti berikut.. ' + '\n\r' + '/setkawasan <kawasan> ' + '\n\r' + 'cth: /setkawasan Kuala Lumpur')
        } else {
          setKawasanChannel(req.body.message.chat.id, cmd2.trim(), function (ret) {
            if (!ret.err) {
              sendMessage(req.body.message.chat.id, 'Tetapan kawasan ' + jenis + ' telah diset kepada ' + cmd2.trim() + '\n\rSaya akan hantar notifikasi apabila masuk waktu :)\n\r\n\rAnda boleh semak waktu solat dengan arahan /waktusolat')
            } else {
              sendMessage(req.body.message.chat.id, ret.err)
            }
          })
        }
      }
    } else {
      session_lastAction(tele.chat.id, function (command, last_text) {
        var cmd_text = tele.text
        if (command !== false) {
          logCommand(command, tele)
          if (command === '/notifikasi') {
            if (cmd_text === 'Kemaskini Lokasi' || cmd_text === 'Aktifkan') {
              session_start(tele.chat.id, command, cmd_text, function () {
                sendMessage(tele.chat.id, 'Okay, sila beritahu saya nama kawasan untuk notifikasi. Anda boleh berikan nama bandar atau negeri.')
              })
            } else if (cmd_text === 'Tidak') {
              sendMessage(tele.chat.id, 'Terima Kasih kerana menggunakan khidmat saya, semoga bermanfaat')
              session_end(tele.chat.id)
            } else if (cmd_text === 'Ya') {
              delChannelKawasan(tele.chat.id, function () {
                sendMessage(tele.chat.id, 'Saya telah menghentikan notifikasi untuk anda. Untuk mengaktifkan kembali notifikasi sila hantar /notifikasi')
                session_end(tele.chat.id)
              })
            } else if (last_text === 'Kemaskini Lokasi' || last_text === 'Aktifkan') {
              if (typeof cmd_text === 'undefined') {
                //do someting
              } else if (cmd_text.length > 1) {
                setKawasanChannel2(tele.chat.id, cmd_text, function (ret) {
                  if (!ret.err) {
                    sendMessage(tele.chat.id, 'Baiklah, saya dah tetapkan notifikasi anda kepada kawasan ' + cmd_text + '. Saya akan hantar notifikasi apabila masuk waktu nanti ya :)')
                    session_end(tele.chat.id)
                  } else {
                    // sendMessage(tele.chat.id, ret.err)

                    if (ret.err['result'] === false) {
                      sendMessage(tele.chat.id, ret.err['msg'])
                      session_end(tele.chat.id)
                    } else {
                      sendMessage_rm(
                        tele.chat.id,
                        ret.err['msg'],
                        ret.err['result']
                      )
                    }

                  }
                })
              }
            }
          }
        } // end command != false
      })
    }
})

var logCommand = function (cmd, tele) {
  console.log(moment().format('DD/MM/YYYY h:mm:ss a') + ' | ' + tele.text + ' | by | ' + tele.from.first_name + ' ' + tele.from.last_name + ' (' + tele.from.id + ')' + ' | in | ' + tele.chat.id + ' | ' + tele.chat.title)
}

var telegramAPI = function (command, data) {
  var options = {
    port: 443,
    host: 'api.telegram.org',
    path: '/bot118555845:AAETitNxuJiTMv4B4Ns0HajCilsRSx-N7nk/' + command,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(data)
    }
  }

  var req = https.request(options, function (res) {
    res.setEncoding('utf8')
    res.on('data', function (chunk) {
        // console.log("body: " + chunk)
    })
  })

  req.write(data)
  req.end()
}

var sendMessage = function (chat_id, text) {
  var data = querystring.stringify({
    chat_id: chat_id,
    text: text
  })

  telegramAPI('sendMessage', data)
}

var sendMessage_rm = function (chat_id, text, reply_markup) {
  reply_markup = {
    'keyboard': reply_markup,
    'one_time_keyboard': true,
    'resize_keyboard': true,
    'force_reply': false
  }

  var data = {}
  data['chat_id'] = chat_id
  data['text'] = text
  data['reply_markup'] = JSON.stringify(reply_markup)
  data = querystring.stringify(data)

  telegramAPI('sendMessage', data)
}

var server = app.listen(808, function () {
  var host = server.address().address
  var port = server.address().port

  console.log('server listen on http://%s:%s', host, port)
})

update_waktu_db()
setupReminder()

cron.scheduleJob({hour: 18, minute: 0}, function () {
  console.log(moment().format('DD/MM/YYYY h:mm:ss a') + ' Resetting timer...')
  resetReminder()
})
