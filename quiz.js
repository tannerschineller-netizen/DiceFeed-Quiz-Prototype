(async () => {
  // ── Loading Helpers ─────────────────────────────────────────────────────────
  const screenLoading = document.getElementById("screen-loading");
  const screenLanding = document.getElementById("screen-landing");
  const screenQuiz = document.getElementById("screen-quiz");
  const screenResults = document.getElementById("screen-results");
  const loadingLog = document.getElementById("loading-log");

  function log(message, type = "info") {
    console.log(`[${type.toUpperCase()}] ${message}`);
    const li = document.createElement("li");
    li.classList.add(type);
    li.textContent = message;
    loadingLog.appendChild(li);
  }

  function showScreen(screen) {
    [screenLoading, screenLanding, screenQuiz, screenResults].forEach((s) =>
      s.classList.remove("active"),
    );
    screen.classList.add("active");
  }

  // ── JSON Fetching ───────────────────────────────────────────────────────────
  async function loadJSON(filename) {
    log(`Fetching ${filename}...`);
    try {
      const res = await fetch(filename);
      log(
        `${filename} — HTTP ${res.status} ${res.statusText}`,
        res.ok ? "info" : "fail",
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      log(`${filename} — parsed OK, ${data.length} record(s) found`, "ok");
      return data;
    } catch (err) {
      log(`${filename} — FAILED: ${err.message}`, "fail");
      throw err;
    }
  }

  //   ── Load Data ───────────────────────────────────────────────────────────────
  log("Starting data load...");

  let questionsData, answersData, diceData;

  try {
    // Load sequentially so the log is easy to read top-to-bottom
    diceData = await loadJSON("dice.json");
    questionsData = await loadJSON("questions.json");
    answersData = await loadJSON("answers.json");
    log("All files loaded successfully — starting quiz", "ok");
  } catch (err) {
    log("One or more files failed to load. Quiz cannot start.", "fail");
    log(
      "Check that all .json files are in the same folder as index.html",
      "info",
    );
    log("Also check the browser console (F12) for more detail", "info");
    return; // Stop execution here — do not proceed to quiz setup
  }

    // ── Data Cleanup ────────────────────────────────────────────────────────────
  function cleanAnswers(data) {
    return data.map(answer => {
      const cleaned = { ...answer };

      ["Three", "Two", "One"].forEach(key => {
        if (Array.isArray(cleaned[key])) {
          // Keep only entries that are numeric (or numeric strings)
          const filtered = cleaned[key].filter(entry => !isNaN(entry) && entry !== "" && entry !== null);
          if (filtered.length > 0) {
            cleaned[key] = filtered;
          } else {
            // Array is empty after filtering — discard the field entirely
            delete cleaned[key];
          }
        } else {
          // Field is missing or not an array — discard it
          delete cleaned[key];
        }
      });

      return cleaned;
    });
  }

  answersData = cleanAnswers(answersData);
  log(`Answers data cleaned — ${answersData.length} entries processed`, "ok");

  // ── Lookup Maps ─────────────────────────────────────────────────────────────
  log(`Building lookup maps...`);

  const answersMap = {};
  const diceMap = {};

  answersData.forEach((a) => {
    answersMap[a.UID] = a;
  });
  diceData.forEach((d) => {
    diceMap[d.UID] = d;
  });

  log(`answersMap: ${Object.keys(answersMap).length} entries`, "ok");
  log(`diceMap: ${Object.keys(diceMap).length} entries`, "ok");

  // Validate that every answer UID referenced in questions actually exists
  let missingAnswers = 0;
  questionsData.forEach((q) => {
    q.Answers.forEach((uid) => {
      if (!answersMap[uid]) {
        log(
          `WARNING: Question ${q.UID} references answer UID "${uid}" not found in answers data`,
          "fail",
        );
        missingAnswers++;
      }
    });
  });
  if (missingAnswers === 0) {
    log("Answer UID cross-check passed", "ok");
  } else {
    log(
      `Answer UID cross-check completed with ${missingAnswers} warning(s) — continuing anyway`,
      "info",
    );
  }

  let missingDice = 0;
  answersData.forEach((a) => {
    [...(a.Three ?? []), ...(a.Two ?? []), ...(a.One ?? [])].forEach((uid) => {
      if (!diceMap[uid]) {
        log(
          `WARNING: Answer ${a.UID} references dice UID "${uid}" not found in dice data`,
          "fail",
        );
        missingDice++;
      }
    });
  });
  if (missingDice === 0) {
    log("Dice UID cross-check passed", "ok");
  } else {
    log(
      `Dice UID cross-check completed with ${missingDice} warning(s) — continuing anyway`,
      "info",
    );
  }

  // Always proceed regardless of validation warnings
  log("Validation complete — preparing to transition...", "info");
  console.log("[INIT] About to set timeout for screen transition");

  await new Promise((resolve) => setTimeout(resolve, 800));

  console.log("[INIT] Timeout complete — calling showScreen(screenLanding)");
  console.log("[INIT] screenLanding element:", screenLanding);

  showScreen(screenLanding);

  console.log("[INIT] showScreen called — checking active classes:");
  console.log("[INIT] screenLoading classes:", screenLoading.className);
  console.log("[INIT] screenLanding classes:", screenLanding.className);

  // ── State ───────────────────────────────────────────────────────────────────
  let currentQuestionIndex = 0;
  let selectedAnswerUID = null;
  let scores = {};

  diceData.forEach((d) => {
    scores[d.UID] = 0;
  });

  // ── DOM References ──────────────────────────────────────────────────────────
  const btnStart = document.getElementById("btn-start");
  const btnNext = document.getElementById("btn-next");
  const btnRestart = document.getElementById("btn-restart");
  const questionCounter = document.getElementById("question-counter");
  const questionText = document.getElementById("question-text");
  const answerGrid = document.getElementById("answer-grid");
  const resultsList = document.getElementById("results-list");

  // ── Quiz Rendering ──────────────────────────────────────────────────────────
  function renderQuestion(index) {
    const question = questionsData[index];
    const isLast = index === questionsData.length - 1;
    const total = questionsData.length;

    selectedAnswerUID = null;
    btnNext.disabled = true;
    btnNext.textContent = isLast ? "See Results" : "Next Encounter!";

    questionCounter.textContent = `Question ${index + 1} of ${total}`;
    questionText.textContent = question.Question;

    answerGrid.innerHTML = "";

    question.Answers.forEach((answerUID) => {
      const answerObj = answersMap[answerUID];
      if (!answerObj) return;

      const box = document.createElement("div");
      box.classList.add("answer-box");
      box.textContent = answerObj.Text;
      box.dataset.uid = answerObj.UID;

      box.addEventListener("click", () => selectAnswer(box, answerObj.UID));
      answerGrid.appendChild(box);
    });
  }

  function selectAnswer(box, uid) {
    answerGrid
      .querySelectorAll(".answer-box")
      .forEach((b) => b.classList.remove("selected"));
    box.classList.add("selected");
    selectedAnswerUID = uid;
    btnNext.disabled = false;
  }

  // ── Scoring ─────────────────────────────────────────────────────────────────
  function applyScores(answerUID) {
    const answer = answersMap[answerUID];
    if (!answer) return;

    (answer.Three ?? []).forEach(uid => { if (String(uid) in scores) scores[String(uid)] += 3; });
    (answer.Two   ?? []).forEach(uid => { if (String(uid) in scores) scores[String(uid)] += 2; });
    (answer.One   ?? []).forEach(uid => { if (String(uid) in scores) scores[String(uid)] += 1; });
  }

  //── Show Results ─────────────────────────────────────────────────────────────────
  async function showResults() {
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const top3 = sorted.slice(0, 3);

    resultsList.innerHTML = "";
    showScreen(screenResults);

    const fetchPromises = top3.map(([uid]) => {
      const dice = diceMap[uid];
      if (!dice) return Promise.resolve(null);

      const li = document.createElement("a");
      li.classList.add("result-card");
      li.href = dice.Link;
      li.target = "_blank";
      li.rel = "noopener noreferrer";

      const img = document.createElement("img");
      img.classList.add("result-img");
      img.alt = dice.Name;
      img.src = "Placeholder_Image-_LPG_Transparent.webp";

      const name = document.createElement("p");
      name.classList.add("result-name");
      name.textContent = dice.Name;

      li.appendChild(img);
      li.appendChild(name);
      resultsList.appendChild(li);

      return fetch(dice.Link)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.text();
        })
        .then((html) => {
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, "text/html");
          const fotoImg = doc.querySelector("img.fotorama__img");
          if (fotoImg) {
            const resolvedSrc = new URL(fotoImg.getAttribute("src"), dice.Link)
              .href;
            img.src = resolvedSrc;
          }
          // If no fotorama__img is found we simply leave the placeholder in place
        })
        .catch(() => {
          // Fetch failed — placeholder stays, no further action needed
        });
    });

    await Promise.all(fetchPromises);
  }

  // ── Event Listeners ─────────────────────────────────────────────────────────
  btnStart.addEventListener("click", () => {
    currentQuestionIndex = 0;
    selectedAnswerUID = null;
    diceData.forEach((d) => {
      scores[d.UID] = 0;
    });

    renderQuestion(currentQuestionIndex);
    showScreen(screenQuiz);
  });

  btnNext.addEventListener("click", () => {
    if (!selectedAnswerUID) return;

    applyScores(selectedAnswerUID);

    const isLast = currentQuestionIndex === questionsData.length - 1;

    if (isLast) {
      showResults();
    } else {
      currentQuestionIndex++;
      renderQuestion(currentQuestionIndex);
    }
  });

  btnRestart.addEventListener("click", () => {
    currentQuestionIndex = 0;
    selectedAnswerUID = null;
    diceData.forEach((d) => {
      scores[d.UID] = 0;
    });

    renderQuestion(currentQuestionIndex);
    showScreen(screenQuiz);
  });

  // ── Hand off to landing ──────────────────────────────────────────────────────
  // Brief pause so the user can read the final "ok" log messages before the
  // screen transitions away
  await new Promise((resolve) => setTimeout(resolve, 800));
  showScreen(screenLanding);
})();
