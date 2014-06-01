var express = require('express'),
    http = require('http'),
    socket_io = require('socket.io'),
    crypto = require('crypto');

app = express();
app.get('/', function (req, res) {
  res.sendfile(__dirname + '/index.html');
});
app.get('/master', function (req, res) {
  res.sendfile(__dirname + '/master.html');
});
app.use("/assets", express.static(__dirname + '/assets'));

server = require('http').createServer(app);
io = socket_io.listen(server);

var generateToken = function() {
  var bytes;
  try {
    bytes = crypto.randomBytes(16);
  } catch (ex) {
    console.log("WARNING: insecure admin token!");
    bytes = crypto.pseudoRandomBytes(16);
  }
  var hmac = crypto.createHmac("sha1", "quiz");
  hmac.update(bytes);
  return hmac.digest("hex");
};

var HOST = process.env.QUIZ_HOST || '127.0.0.1';
var PORT = process.env.QUIZ_PORT || 8000;
var MAX_NAME_LENGTH = 30;
var ADMIN_SECRET = process.env.QUIZ_SECRET || generateToken();
var SCORE_CORRECT_ANSWER = 10;
var SCORE_WRONG_ANSWER = -SCORE_CORRECT_ANSWER;
var SCORE_NO_ANSWER = -5;
// if a question has multiple valid answers, this specifies the penalty
// for giving one (or more) correct answers, but failing to provide
// the others. this is per-page.
// Example: answers A and B are right, the client chooses A, but not B,
// then this variable determines how it will be judged.
// Note: This does not apply to the case of choosing no answer at all.
var SCORE_PER_MISSING_MULTI = -2;
var clients = [];
var answers = {};
var ranking = [];
var currentQuestion;
var currentQuestionTimestamp = 0;
var isCurrentQuestionScored;
var currentSolutions = null;

server.listen(PORT, HOST);
console.log("http://%s:%d/master#secret=%s", HOST, PORT, ADMIN_SECRET);

var sanitizeName = function(name) {
  name = name.substr(0, MAX_NAME_LENGTH);
  name = name.replace(/[^0-9a-zA-Zäöüß \-]/, '');
  return name;
};

var broadcastToControllers = function(event, data) {
  return broadcastToAll(event, data, function(client) {
    return !!client.isController;
  });
};

var getExportableClientInfo = function(client) {
  return {
    id: client.id,
    name: client.name,
    role: client.isController ? 'controller' : '',
    rank: client.rank,
    score: client.score,
    averageAnswerTime: client.averageAnswerTime,
    active: client.active,
  };
};

var broadcastToAll = function(event, data, only_allow_func) {
  forEachClient(function(client) {
    if (only_allow_func && !only_allow_func(client)) {
      return;
    }
    client.socket.emit(event, data);
  });
};

var forEachClient = function(func) {
  for (var idx=0; idx < clients.length; idx++) {
    func(clients[idx]);
  }
};

var updateClientAnswerTime = function(client) {
  if (!answers[client.id] || !answers[client.id][currentQuestion.questionId] || !answers[client.id][currentQuestion.questionId].length) {
    return;
  }
  clientCurrentAnswerTime =
    client.currentAnswerTimestamp - currentQuestionTimestamp;
  if (clientCurrentAnswerTime < 0) return;
  client.totalAnswerTime += clientCurrentAnswerTime;
  client.questionsAnswered += 1;
  client.averageAnswerTime = Math.round(
    client.totalAnswerTime/client.questionsAnswered/10)/100;
};

Array.prototype.contains = function(item) {
  return this.indexOf(item) !== -1;
};

Array.prototype.remove = function(item) {
  var index = this.indexOf(item);
  if (index !== -1) {
    this.splice(index, 1);
    return true;
  }
};

var getTimestamp = function() {
  var msec = new Date().getTime();
  return msec;
};

var isNameUsed = function(name) {
  var result = false;
  var lowerName = name.toLowerCase();
  forEachClient(function(client) {
    if (!client.name) return;
    if (client.name.toLowerCase() == lowerName) {
      result = true;
    }
  });
  return result;
};

var getAnswersByClient = function(questionId, client) {
  if (!answers[client.id]) {
    return [];
  }
  selectedAnswers = answers[client.id][questionId];
  if (!selectedAnswers) {
    return [];
  }
  return selectedAnswers;
};

var updateClientScore = function(client) {
  var questionId = currentSolutions.questionId;
  var correctAnswers = currentSolutions.solutions;
  var selectedAnswers = getAnswersByClient(questionId, client);
  if (!selectedAnswers.length) {
    if (correctAnswers.length) {
      client.score += SCORE_NO_ANSWER;
    } else {
      // question with no right answers, so the client's choice
      // was right!
      client.score += SCORE_CORRECT_ANSWER;
    }
    return;
  }
  selectedAnswers.forEach(function(answerId) {
    if (correctAnswers.contains(answerId)) {
      client.score += SCORE_CORRECT_ANSWER;
    } else {
      client.score += SCORE_WRONG_ANSWER;
    }
  });
  correctAnswers.forEach(function(answerId) {
    if (!selectedAnswers.contains(answerId)) {
      client.score += SCORE_PER_MISSING_MULTI;
    }
    // else: already accounted for in above section!
  });
};

var updateClientRank = function(client) {
  client.rank = ranking.indexOf(client.id) + 1;
};

var resetAnswersForQuestion = function(questionId) {
  Object.keys(answers).forEach(function(clientId) {
    answers[clientId][questionId] = [];
  });
};

var notifyClientAboutTheirStatus = function(client) {
  client.socket.emit('your-status', {
    score: client.score,
    rank: client.rank,
    averageAnswerTime: client.averageAnswerTime
  });
};

var getClientById = function(clientId) {
  var ret;
  forEachClient(function(client) {
    if (client && client.id && client.id == clientId) {
      ret = client;
    }
  });
  return ret;
};

var rankClientsByScoreAndTime = function() {
  ranking.sort(function(clientIdA, clientIdB) {
    a = getClientById(clientIdA);
    b = getClientById(clientIdB);
    if (!a || !b) return 0;
    if (!a.name) return -1;
    if (!b.name) return +1;
    if (a.score > b.score) return -1;
    if (a.score < b.score) return +1;
    if (a.averageAnswerTime < b.averageAnswerTime) return -1;
    if (a.averageAnswerTime > b.averageAnswerTime) return +1;
    if (a.name < b.name) return -1;
    if (a.name > b.name) return +1;
    return 0;
  });
};

var sendUserListToClient = function(client) {
  forEachClient(function(otherclient) {
    client.socket.emit('user-connect',
      getExportableClientInfo(otherclient));
  });
};

var sendScoreboardToControllers = function() {
  forEachClient(function(client) {
    broadcastToControllers('user-update', getExportableClientInfo(client));
  });
};

io.sockets.on('connection', function (socket) {
  var client = {id: generateToken()};
  clients.push(client);
  client.active = true;
  client.socket = socket;
  client.score = 0;
  client.rank = 0;
  client.questionsAnswered = 0;
  client.totalAnswerTime = 0;
  client.averageAnswerTime = 0.0;
  client.currentAnswerTimeStamp = 0;
  client.socket.emit('your-id', {id: client.id});
  console.log("client #%s connected", client.id);
  broadcastToControllers('user-connect', getExportableClientInfo(client));

  socket.on('disconnect', function() {
    console.log("client #%s disconnected", client.id);
    if (client.name) {
      client.active = false;
      broadcastToControllers('user-update', getExportableClientInfo(client));
    } else {
      delete answers[client.id];
      ranking.remove(client.id);
      clients.remove(client);
      broadcastToControllers('user-disconnect', {id: client.id});
    }
  });

  socket.on('resume-previous-session', function(prevId) {
    var prevClient = getClientById(prevId);
    if (!prevClient) {
      console.log("client #%s: attempt to resume unknown session %s",
        client.id, prevId);
      socket.emit("cannot-resume");
      return;
    }
    console.log("client #%s resuming session %s", client.id, prevId);

    // copy data from previous session
    client.name = prevClient.name;
    client.score = prevClient.score;
    client.rank = prevClient.rank;
    client.questionsAnswered = prevClient.questionsAnswered;
    client.averageAnswerTime = prevClient.averageAnswerTime;
    client.totalAnswerTime = prevClient.totalAnswerTime;
    answers[client.id] = answers[prevId];
    var rankingIdx = ranking.indexOf(prevId);
    if (rankingIdx != -1) {
      ranking[rankingIdx] = client.id;
    }

    // finally clean up data from the old instance
    delete answers[client.id];
    clients.remove(prevClient);
    broadcastToControllers('user-disconnect', {id: prevId});

    rankClientsByScoreAndTime();
    forEachClient(updateClientRank);
    sendScoreboardToControllers();

    if (client.name) {
      socket.emit("name-ok", {name: client.name});
      if (currentQuestion) {
        socket.emit("question", currentQuestion);
      }
    }
  });

  socket.on('set-name', function(data) {
    if (client.name || !data.name || isNameUsed(data.name)) {
      socket.emit("name-error");
      return;
    }
    client.name = sanitizeName(data.name);
    socket.emit("name-ok", {name: client.name});
    console.log("client #%s is now known as '%s'", client.id, client.name);
    ranking.push(client.id);
    rankClientsByScoreAndTime();
    forEachClient(updateClientRank);
    sendScoreboardToControllers();
    if (currentQuestion) {
      socket.emit("question", currentQuestion);
    }
  });

  socket.on('authenticate', function(data) {
    // timing side channel
    if (data.role != 'controller' || data.secret != ADMIN_SECRET) {
      console.log("WARNING: client %s - bad authentication as controller!", client.id);
      console.log("  supplied secret was %s", data.secret);
      console.log("Current secret is: %s", ADMIN_SECRET);
      socket.emit('fatal-error', {message: 'Authentication problem'});
      return;
    }
    client.isController = true;
    // controllers should not be ranked!
    ranking.remove(client.id);
    console.log("client #%s is now a controller", client.id);
    socket.emit("authenticated");
    broadcastToControllers('user-update', getExportableClientInfo(client));
    sendUserListToClient(client);
  });

  socket.on('push-question', function(data) {
    if (!client.isController) {
      // illegal access!
      return;
    }
    currentQuestion = data;
    currentSolutions = null;
    isCurrentQuestionScored = 0;
    resetAnswersForQuestion(data.questionId);
    broadcastToAll('question', data);
    currentQuestionTimestamp = getTimestamp();
  });

  socket.on('push-solutions', function(data) {
    if (!client.isController) {
      // illegal access!
      return;
    }
    currentSolutions = data;
    broadcastToAll('solutions', data);
    if (!isCurrentQuestionScored) {
      isCurrentQuestionScored = true;
      forEachClient(updateClientAnswerTime);
      forEachClient(updateClientScore);
      rankClientsByScoreAndTime();
      forEachClient(updateClientRank);
    }
    sendScoreboardToControllers();
    forEachClient(notifyClientAboutTheirStatus);
  });

  socket.on('update-answer', function(data) {
    if (!currentQuestion || data.questionId != currentQuestion.questionId || currentSolutions) {
      console.log("WARNING: client %s - received answer for inactive or solved question %d", client.id, data.questionId);
      return;
    }
    var answerTime = getTimestamp();
    var answerId = parseInt(data.answerId);
    if (!answers[client.id]) {
      // no answers from this client yet? create an empty structure:
      answers[client.id] = {};
    }
    var clientAnswers = answers[client.id]
    if (!clientAnswers[currentQuestion.questionId]) {
      clientAnswers[currentQuestion.questionId] = [];
    }
    var questionAnswers = clientAnswers[currentQuestion.questionId];
    var answerIsInList = questionAnswers.contains(answerId);
    if (data.state == 'selected' && !answerIsInList) {
      questionAnswers.push(answerId);
    } else if (data.state == 'deselected' && answerIsInList) {
      questionAnswers.remove(answerId);
    }
    client.currentAnswerTimestamp = answerTime;
    broadcastToControllers('user-update', {
      id: client.id,
      answers: questionAnswers
    });
  });
});
