window.socket = io.connect('http://' + window.location.host);

var COOKIE_SESSION_NAME = "quiz_sid";

var mySessionId;

var getStoredSessionId = function() {
  var id = $.cookie(COOKIE_SESSION_NAME);
  return id;
};

var saveSessionId = function(id) {
  $.cookie(COOKIE_SESSION_NAME, id);
};

var resumeToLogin = function() {
  $(".resume-view").hide();
  $(".login-view").show();
  $(".login-view input").focus();
};

socket.on('connect', function(data) {
  $(".status").text("verbunden");
  $(".connect-view").hide();
  if (getStoredSessionId()) {
    $(".resume-view").show();
  } else {
    $(".login-view").show();
    $(".login-view input").focus();
  }
});
socket.on('disconnect', function(data) {
  $(".status").text("getrennt (neuladen!)");
});
socket.on('reconnect', function(data) {
  $(".quiz-view").hide();
  window.location.reload();
});
socket.on('cannot-resume', function() {
  resumeToLogin();
  $(".error")
    .text("Sitzung konnte nicht fortgesetzt werden. Server zwischenzeitlich neugestartet?")
    .show();
});
socket.on('your-id', function(data) {
  mySessionId = data.id; // global
  $(".userid")
    .attr("title", "#" + data.id)
    .tooltip('destroy')
    .tooltip();
});
socket.on('name-ok', function(data) {
  $(".login-view").hide();
  $(".resume-view").hide();
  $(".name").text(data.name);
  $(".quiz-view").show();
  $(".status-view").show();
  saveSessionId(mySessionId);
});
socket.on('name-error', function(data) {
  $(".error")
    .text("Login mit diesem Namen nicht möglich. Name schon vergeben?")
    .show();
});

socket.on('your-status', function(data) {
  $(".score").text(data.score);
  $(".rank").text(data.rank);
  if (data.averageAnswerTime !== undefined && data.averageAnswerTime !== null) {
    $(".average-answer-time").text(data.averageAnswerTime + "s");
  }
});

socket.on('question', function(data) {
  $(".quiz-view .question")
    .html(data.html)
    .attr('data-question-id', data.questionId)
    .removeClass('solved');
});

socket.on('solutions', function(data) {
  var $question = $(
    ".quiz-view [data-question-id=" + data.questionId + "]")
    .addClass("solved");
  $(data.solutions).each(function(idx, answerIndex) {
    var nth = answerIndex + 1; // nth is 1-based
    $question.find("ol > li:nth-child(" + nth + ")")
      .addClass("solution");
  });
});

$(function() {
  $(".login-view form").bind('submit', function(e) {
    e.preventDefault();
    var name = $(".login-view input").val();
    socket.emit('set-name', {name: name});
  });

  $(".resume-view form").bind('submit', function(e) {
    e.preventDefault();
    socket.emit('resume-previous-session', getStoredSessionId());
  });
  $(".resume-view form .login").bind('click', function(e) {
    e.preventDefault();
    resumeToLogin();
  });
  
  $(".quiz-view").on('click', 'ol > li', function(e) {
    e.preventDefault();
    var $quiz = $(".quiz-view");
    var $question = $quiz.find(".question");
    if ($question.hasClass("solved")) {
      return;
    }
    var questionId = $question.attr('data-question-id');
    var answer = e.currentTarget;
    var $answer = $(answer);
    var answerId = $question.find("ol > li").index(answer);
    var state;
    if ($answer.hasClass('selected')) {
      $answer.removeClass('selected');
      state = 'deselected';
      if ($question.find(".selected").length <= 0) {
        $quiz.removeClass("selected");
      }
    } else {
      $answer.addClass('selected');
      state = 'selected';
      $quiz.addClass("selected");
    }
    socket.emit('update-answer', {
      questionId: questionId,
      answerId: answerId,
      state: state
    });
  });
});

