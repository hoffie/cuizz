var socket = io.connect('http://' + window.location.host);

var getHashArg = function(key) {
  var re = new RegExp(".*(^|&|#)" + key + "=([^&]*)(&|$)");
  if (window.location.hash.match(re)) {
    return RegExp.$2;
  }
  return "";
};

var setHashArg = function(key, value) {
  var re = new RegExp("(.*?(?:^|&|#))" + key + "=[^&]*((?:&|$).*?)");
  var newHash = window.location.hash;
  if (newHash.match(re)) {
    newHash = RegExp.$1 + RegExp.$2;
  }
  if (value != "") {
    if (newHash && newHash != "#" && newHash[newHash.length-1] != "&") {
      newHash += "&";
    }
    // FIXME: urlencode
    newHash += key + '=' + value;
  }
  window.location.hash = newHash;
};

var getSecret = function() {
  var hash = getHashArg("secret");
  if (hash) {
    $.cookie("secret", hash);
  } else {
    hash = $.cookie("secret");
  }
  return hash;
};

var userList = function() {
  return {
    users: [],
    update: function(user) {
      var myUser = this.getUserById(user.id);
      if (!myUser) {
        this.users.push(user);
        return;
      }

      var attrs = ["name", "score", "rank", "active",
        "role", "averageAnswerTime", "answers"];
      var attr;
      for (var i=0; i < attrs.length; i++) {
        attr = attrs[i];
        if (user[attr] !== undefined) {
          myUser[attr] = user[attr];
          if (attr == "rank") {
            needSort = true;
          }
        }
      }
    },
    updateAndSort: function(user) {
      this.update(user);
      this.sort();
    },
    remove: function(user) {
      for (var i=0; i < this.users.length; i++) {
        if (this.users[i].id == user.id) {
          // gap-less array delete:
          if (i == this.users.length - 1) {
            this.users.pop();
          } else {
            this.users[i] = this.users.pop();
          }
          break;
        }
      }
    },
    sort: function() {
      var cmp = function(a, b) {
        if (a.rank < b.rank) {
          return -1;
        } else if (a.rank == b.rank) {
          return 0;
        } else {
          return 1;
        }
      };
      this.users.sort(cmp);
    },
    getUserById: function(id) {
      for (var i=0; i < this.users.length; i++) {
        if (this.users[i].id == id) {
          return this.users[i];
        }
      }
    },
    getNumberOfX: function(cb) {
      this._numAnon = 0;
      this.forEachUser(function(user) {
        if (cb(user)) {
          this._numAnon++;
        }
      }.bind(this));
      return this._numAnon;
    },
    forEachUser: function(cb) {
      for (var i=0; i < this.users.length; i++) {
        cb(this.users[i]);
      }
    },
    resetUserAnswers: function() {
      this.forEachUser(function(user) { user.answers = []; });
    }
  };
}();

var scoreboard = function() {
  var $root = $(".scoreboard");
  var $tbody = $($root.find("table tbody"));
  var $num_anon = $($root.find(".num-anonymous"));
  return {
    redraw: function() {
      $tbody.empty();
      userList.forEachUser(this.drawUser.bind(this));
      $num_anon.text(userList.getNumberOfX(this.isHidden));
    },
    isHidden: function(user) {
      return user.role == "controller" || !user.name;
    },
    drawUser: function(user) {
      if (this.isHidden(user)) {
        return;
      }
      var $tr = $("<tr/>")
        .attr("data-id", user.id)
        .append(
          $("<td/>")
            .addClass("rank")
            .text(user.rank || "")
        )
        .append(
          $("<td/>")
            .addClass("name")
            .text(user.name || ('Anon (' + user.id.substr(0, 8) + ')'))
        )
        .append(
          $("<td/>")
            .addClass("score")
            .text(user.score)
        )
        .append(
          $("<td/>")
            .addClass("average-answer-time")
            .text(user.averageAnswerTime && user.averageAnswerTime.toFixed(2) + 's' || "")
        );
      if (user.answers !== undefined && user.answers.length) {
        $tr.addClass('has-answered');
      }
      if (user.active === false) {
        $tr.addClass('inactive');
      }
      $tbody.append($tr);
    },
  };
}();

var handleUserUpdate = function(user) {
  userList.updateAndSort(user);
  scoreboard.redraw();
};

var onConnectionError = function() {
  alert("Verbindung unterbrochen. Bitte neuladen.");
};
socket.on('disconnect', onConnectionError);
socket.on('reconnect', onConnectionError);

socket.on('user-connect', handleUserUpdate);
socket.on('user-update', handleUserUpdate);
socket.on('user-disconnect', function(user) {
  userList.remove(user);
});
socket.on('fatal-error', function(data) {
  alert(data.message);
});

$(function() {
  var questionId = 0;
  var currentQuestionSolved = false;

  var canChangeQuestion = function(offset) {
    var targetQuestionId = questionId + offset;
    var numQuestions = $(".quiz section").length;
    if (targetQuestionId < 0 || targetQuestionId > numQuestions) {
      return false;
    }
    return true;
  };

  var changeQuestion = function(offset) {
    if (!canChangeQuestion(offset)) {
      return;
    }
    if (questionId && !currentQuestionSolved) {
      if (!confirm("Frage wechseln, obwohl die aktuelle noch nicht aufgelöst wurde?")) {
        return;
      }
    }
    questionId += offset;
    showCurrentQuestion();
  };

  var showCurrentQuestion = function() {
    currentQuestionSolved = false;
    $(".quiz section").removeClass("active solved");
    var $target = $(".quiz section:nth-child(" + questionId + ")");
    if ($target) {
      var $clone = $target.clone();
      // better not send the answer indication to the clients...
      $clone.find("li")
        .attr("data-solution", null);
      socket.emit("push-question", {
        questionId: questionId,
        html: $clone.html()
      });
      $target.addClass("active");
      userList.resetUserAnswers();
      scoreboard.redraw();
      setHashArg("question", questionId);
    }
  };

  var updateControls = function() {
    var next_state;
    if (canChangeQuestion(+1)) {
      next_state = null;
    } else {
      next_state = 'disabled';
    }
    if (canChangeQuestion(-1)) {
      prev_state = null;
    } else {
      prev_state = 'disabled';
    }
    $(".controls .next").attr('disabled', next_state);
    $(".controls .prev").attr('disabled', prev_state);
  };
  $(".controls .next").bind('click', function() {
    changeQuestion(+1);
    updateControls();
  });
  $(".controls .prev").bind('click', function() {
    changeQuestion(-1);
    updateControls();
  });
  $(".controls .solve").bind('click', function() {
    var solutions = [];
    $(".quiz section.active").addClass("solved");
    var $answers = $(".quiz section.active ol > li").each(function() {
      var $this = $(this);
      if ($this.attr('data-solution') !== undefined) {
        solutions.push($this.index());
      }
    });
    socket.emit('push-solutions', {
      questionId: questionId,
      solutions: solutions
    });
    currentQuestionSolved = true;
  });

  socket.on('authenticated', function() {
    // restore pre-selected question from URL?
    var urlQuestionId = getHashArg("question");
    if (urlQuestionId !== "") {
      questionId = parseInt(urlQuestionId);
      showCurrentQuestion();
    }
  });

  socket.emit('authenticate', {
    role: 'controller',
    secret: getSecret()
  });
  setHashArg("secret", "");

});
