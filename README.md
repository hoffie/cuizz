Cuizz
=====
Cuizz is a simple HTML5-based quiz application, which can be used to run question and answer sessions after presentations in front of an audience.

Cuiss consists of an admin console (/master) and a client interface.
The admin console displays a scoreboard and provides question navigation options.
This is the interface which will be used by you as the presenter (you will most likely want to show this on a beamer or something).

The normal client interface will be used by the quiz participants and can be accessed from smartphones, tablets or laptops.

Requirements
------------
- a server
  - with some more or less recent nodejs version (v0.10.x works great) with npm to install the necessary requirements (socket.io, express)
  - which is somehow accessible to your clients (domain, static IP or something)
- clients with a modern browser (tested with Chromium, Firefox and Android browsers)

Usage
-----
1. Edit master.html and insert questions and answers as you like.
2. Run ```npm install``` (this will install socket.io and express)
3. Start the server: ```nodejs server.js```
4. Navigate to the URL outputted on console (http://127.0.0.1:8000/master#secret=...)
5. Open one or more clients and point them to http://127.0.0.1:8000/
6. Start the quiz by hitting *Next question* in the admin console
7. You will see user entries lighting up in the scoreboard as the users enter their answers.
8. Once all (or 'enough') users entered there answers, solve the question by hitting *Show answers*. This will also grade the users.

Server options (running a public server)
----------------------------------------
By default, the server listens on localhost only.
Use the following environment options to control that:

- ```QUIZ_HOST=0.0.0.0```: to listen on all interfaces
- ```QUIZ_PORT=9000```: to use another port than 8000
- ```QUIZ_SECRET=abc```: to use a given secret instead of a random value

Example:
```QUIZ_HOST=0.0.0.0 QUIZ_PORT=9000 QUIZ_SECRET=geheim nodejs server.js```

Localization
------------
UI strings are currently hardcoded in German, but they should be self-explaining enough to translate them into the language of your choice.

Appearance
----------
To adapt the appearance to your needs, edit index.html, master.html and/or the related style sheets.

Security
--------
Currently there is no DoS protection of any sort. This means that a huge spike of clients could possible crash the server.

Ensuring that only you can control the admin console requires that you choose a random or at least secret token. The server will automatically generate such a token on start up. Just keep this secret.
Also, if you are running this across untrusted networks, the secret will travel the net in cleartext, unless you run some HTTPS-enabling thing (adapt server.js or use a reverse proxy).

Security should be sufficient to run this on a trusted network for an entertaining quiz.
Do not use it over the internet and do not use it to run anything important (i.e. don't have your students do graded examinations using Cuizz).

Scalability
-----------
There are no hard limits regarding the possible number of clients.
Tests have only been done with up to 30 clients though.
Do some testing first if you plan to address a larger audience.

Question format
---------------
Questions are structed in ```<section>```s (the structure is similar to reveal.js).
You can use arbitrary HTML there, even highlight.js proved to work without problems.
The answering options have to be marked up as an ordered list (```<ol>```), where the correct answers must have the ```data-solution``` attribute set.
There are no limits on how many of the answers may be valid; zero, all or anything in-between is ok.

Questions will be streamed from the master panel to clients as they are, with one single modification: the ```data-solution``` attribute will be stripped.
So ensure that there are no other indications on which answer is correct, otherwise clients would be able to cheat their way through the quiz.

Scoring
-------
- each correct answer yields +10 points
- each wrong answer yields -10 points
- if no answer is given by the client
  - but has at least one correct solution, there is a -5 points penalty
  - and there are no correct solutions, it is treated like a correct answer (+10 points)
- if one or more correct answers are provided, but there are more correct solutions, each missing solution will yield -2 points

This scoring can be changed, refer to the SCORE_* constants in server.js.

Quality
-------
This initially started as a quick hack to run a quiz for a university presentation.
Lots of coding was done at night times and in a last-minute style, so take it with a grain of salt.

Consider it **beta** quality and do some testing before using it.

Libraries
---------
The backend is based on socket.io and express, running on node.js.
The UI is built using Twitter Bootstrap 3 and Font Awesome.


Author
------
Cuizz has been created by Christian Hoffmann <mail@hoffmann-christian.info>.

License
-------
Cuizz is being released under the MIT license.
