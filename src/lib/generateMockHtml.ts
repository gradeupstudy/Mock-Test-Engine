import { OnlineMockConfig } from '../types';

function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function generateMockTestHtmlString(config: OnlineMockConfig): string {
  const jsonConfig = JSON.stringify(config).replace(/script/g, 'scr"+"ipt');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(config.testName)} - ${escapeHtml(config.instituteName || 'Gradeup Study')} Online Test</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    body {
      font-family: 'Plus Jakarta Sans', sans-serif;
      background-color: #0b0f29;
      color: #e2e8f0;
    }
    .custom-scrollbar::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
      background: #1e293b;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
      background: #3b82f6;
      border-radius: 3px;
    }
    @media print {
      .no-print { display: none !important; }
      body { background: white !important; color: black !important; }
      .print-card { border: 1px solid #ccc !important; background: white !important; color: black !important; box-shadow: none !important; }
    }
  </style>
</head>
<body class="min-h-screen flex flex-col selection:bg-blue-500/30">

  <!-- TOP BRANDING HEADER -->
  <header class="bg-[#11183c] border-b border-slate-800 sticky top-0 z-40 px-4 py-3 shadow-md no-print">
    <div class="max-w-7xl mx-auto flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center font-black text-white text-xl shadow-lg shadow-blue-500/20">
          GS
        </div>
        <div>
          <h1 class="text-base font-bold text-white leading-tight">${escapeHtml(config.instituteName || 'Gradeup Study')}</h1>
          <p class="text-xs text-blue-400 font-medium">Online Interactive Test Engine</p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
          ${escapeHtml(config.testName)}
        </span>
        <button onclick="exitPortal()" class="px-3 py-1 rounded-lg text-xs font-bold bg-rose-950/80 text-rose-200 border border-rose-800 hover:bg-rose-900 transition no-print">
          Exit Portal
        </button>
      </div>
    </div>
  </header>

  <!-- MAIN APP CONTAINER -->
  <main id="app" class="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
    <!-- Dynamic JS Content Injected Here -->
  </main>

  <script>
    // Embed Test Configuration
    const TEST_CONFIG = ${jsonConfig};

    // State
    let currentStep = 'SOCIAL_FOLLOW'; // 'SOCIAL_FOLLOW' | 'REGISTRATION' | 'TEST_RUNNING' | 'RESULT'
    let visitedSocials = {};
    let studentDetails = {
      name: '',
      mobile: '',
      state: 'Rajasthan',
      district: ''
    };

    let currentQIndex = 0;
    let userAnswers = {}; // { qIndex: 'A'|'B'|'C'|'D' }
    let reviewMarked = {}; // { qIndex: boolean }
    let timeLeftSeconds = (TEST_CONFIG.duration || 60) * 60;
    let timerInterval = null;
    let isLanguageHindi = false;
    let submissionResult = null;

    const INDIAN_STATES = [
      'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
      'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
      'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
      'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
      'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
      'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Delhi', 'Jammu and Kashmir'
    ];

    function exitPortal() {
      currentStep = 'EXITED';
      renderApp();
      try {
        window.close();
      } catch (e) {}
    }

    function renderApp() {
      const container = document.getElementById('app');
      if (!container) return;

      if (currentStep === 'EXITED') {
        container.innerHTML = \`
          <div class="max-w-md mx-auto my-12 bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-6 shadow-2xl">
            <div class="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400 text-3xl">
              ✓
            </div>
            <div class="space-y-2">
              <h2 class="text-2xl font-bold text-white">Portal Exited Successfully</h2>
              <p class="text-xs text-slate-400 leading-relaxed">
                You have safely logged out and exited the Gradeup Study Mock Portal. You can now close this browser tab or window.
              </p>
            </div>
            <div class="pt-2">
              <button onclick="window.close(); setTimeout(function(){ window.location.href='about:blank'; }, 200);" class="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition shadow">
                Close Tab / Exit Page
              </button>
            </div>
          </div>
        \`;
      } else if (currentStep === 'SOCIAL_FOLLOW') {
        container.innerHTML = renderSocialFollowStep();
      } else if (currentStep === 'REGISTRATION') {
        container.innerHTML = renderRegistrationStep();
      } else if (currentStep === 'TEST_RUNNING') {
        container.innerHTML = renderTestRunningStep();
      } else if (currentStep === 'RESULT') {
        container.innerHTML = renderResultStep();
      }
    }

    // --- STEP 1: SOCIAL FOLLOW SCREEN ---
    function renderSocialFollowStep() {
      const tasks = TEST_CONFIG.socialTasks || [];
      const reqTasks = tasks.filter(t => t.isRequired !== false);
      const allReqCompleted = reqTasks.length === 0 || reqTasks.every(t => visitedSocials[t.id]);

      let tasksHtml = '';
      if (tasks.length === 0) {
        tasksHtml = '<p class="text-sm text-slate-400 py-4">No social tasks configured. Click below to continue.</p>';
      } else {
        tasksHtml = tasks.map(t => {
          const isDone = visitedSocials[t.id];
          return \`
            <div class="p-4 rounded-xl border \${isDone ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-slate-700 bg-slate-800/50'} flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg \${isDone ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'} flex items-center justify-center font-bold">
                  \${isDone ? '✓' : '➔'}
                </div>
                <div>
                  <h4 class="text-sm font-semibold text-white">\${escapeHtml(t.title || 'Follow Task')}</h4>
                  <p class="text-xs text-slate-400">\${t.isRequired !== false ? '<span class="text-rose-400 font-bold">* Mandatory</span>' : 'Optional'}</p>
                </div>
              </div>
              <button onclick="handleSocialClick('\${t.id}', '\${escapeJs(t.url)}')" class="px-4 py-2 rounded-lg text-xs font-bold shadow-md transition flex items-center gap-2 \${isDone ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'}">
                \${isDone ? '✓ Completed' : 'Follow & Open Link ↗'}
              </button>
            </div>
          \`;
        }).join('');
      }

      return \`
        <div class="max-w-2xl mx-auto space-y-6">
          <div class="bg-[#11183c] border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl text-center space-y-4">
            <div class="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-3xl mx-auto shadow-lg shadow-blue-500/30">
              📢
            </div>
            <div>
              <h2 class="text-2xl font-extrabold text-white">Follow Official Channels to Unlock Test</h2>
              <p class="text-sm text-slate-400 mt-1">Please support us by following our official handles before starting your online test.</p>
            </div>

            <div class="space-y-3 text-left pt-2">
              \${tasksHtml}
            </div>

            <div class="pt-4 border-t border-slate-800 flex flex-col gap-3">
              <button onclick="handleConfirmSocials()" \${!allReqCompleted ? 'disabled' : ''} class="w-full py-3.5 px-6 rounded-xl font-bold text-base shadow-xl transition flex items-center justify-center gap-2 \${allReqCompleted ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white cursor-pointer' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}">
                Unlock Student Registration Form ➔
              </button>
              \${!allReqCompleted ? '<p class="text-xs text-amber-400 font-medium">Please click and visit all mandatory links above to enable registration.</p>' : ''}
            </div>
          </div>
        </div>
      \`;
    }

    function handleSocialClick(id, url) {
      if (url) {
        window.open(url, '_blank');
      }
      visitedSocials[id] = true;
      renderApp();
    }

    function handleConfirmSocials() {
      currentStep = 'REGISTRATION';
      renderApp();
    }

    // --- STEP 2: CANDIDATE REGISTRATION SCREEN ---
    function renderRegistrationStep() {
      const stateOptions = INDIAN_STATES.map(s => \`<option value="\${s}" \${studentDetails.state === s ? 'selected' : ''}>\${s}</option>\`).join('');

      return \`
        <div class="max-w-xl mx-auto space-y-6">
          <div class="bg-[#11183c] border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
            <div class="text-center space-y-2">
              <div class="w-14 h-14 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center text-2xl mx-auto border border-blue-500/20">
                📝
              </div>
              <h2 class="text-xl font-bold text-white">Candidate Registration</h2>
              <p class="text-xs text-slate-400">Fill in your details to start the exam timer.</p>
            </div>

            <form onsubmit="handleStartTestSubmit(event)" class="space-y-4">
              <div>
                <label class="block text-xs font-semibold text-slate-300 mb-1">Full Candidate Name *</label>
                <input type="text" id="reg_name" required value="\${escapeHtml(studentDetails.name)}" oninput="studentDetails.name=this.value" placeholder="Enter your full name" class="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm focus:border-blue-500 focus:outline-none">
              </div>

              <div>
                <label class="block text-xs font-semibold text-slate-300 mb-1">Mobile Number (10 Digits) *</label>
                <input type="tel" id="reg_mobile" required pattern="[0-9]{10}" maxLength="10" value="\${escapeHtml(studentDetails.mobile)}" oninput="studentDetails.mobile=this.value" placeholder="9876543210" class="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm focus:border-blue-500 focus:outline-none">
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-semibold text-slate-300 mb-1">State *</label>
                  <select id="reg_state" onchange="studentDetails.state=this.value" class="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm focus:border-blue-500 focus:outline-none">
                    \${stateOptions}
                  </select>
                </div>
                <div>
                  <label class="block text-xs font-semibold text-slate-300 mb-1">District / City *</label>
                  <input type="text" id="reg_district" required value="\${escapeHtml(studentDetails.district)}" oninput="studentDetails.district=this.value" placeholder="e.g. Jaipur" class="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm focus:border-blue-500 focus:outline-none">
                </div>
              </div>

              <div class="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300 space-y-1">
                <p class="font-bold">📋 Test Overview:</p>
                <div class="grid grid-cols-2 gap-1 pt-1 text-slate-300">
                  <span>Questions: <b>\${TEST_CONFIG.questions.length}</b></span>
                  <span>Duration: <b>\${TEST_CONFIG.duration} Mins</b></span>
                  <span>Marks / Question: <b>+\${TEST_CONFIG.marksPerQuestion}</b></span>
                  <span>Negative Marking: <b>-\${TEST_CONFIG.negativeMarksPerQuestion}</b></span>
                </div>
              </div>

              <button type="submit" class="w-full py-3.5 px-6 rounded-xl font-bold text-base bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-xl transition flex items-center justify-center gap-2 cursor-pointer">
                Start Test Now 🚀
              </button>
            </form>
          </div>
        </div>
      \`;
    }

    function handleStartTestSubmit(e) {
      e.preventDefault();
      const name = document.getElementById('reg_name').value.trim();
      const mobile = document.getElementById('reg_mobile').value.trim();
      const stateVal = document.getElementById('reg_state').value;
      const districtVal = document.getElementById('reg_district').value.trim();

      if (!name || !mobile || mobile.length !== 10) {
        alert('Please enter a valid candidate name and 10-digit mobile number.');
        return;
      }

      studentDetails.name = name;
      studentDetails.mobile = mobile;
      studentDetails.state = stateVal;
      studentDetails.district = districtVal;

      currentStep = 'TEST_RUNNING';
      startExamTimer();
      renderApp();
    }

    function startExamTimer() {
      if (timerInterval) clearInterval(timerInterval);
      timerInterval = setInterval(() => {
        timeLeftSeconds--;
        if (timeLeftSeconds <= 0) {
          clearInterval(timerInterval);
          alert('Time limit reached! Submitting test automatically.');
          submitTest();
        } else {
          updateTimerDisplay();
        }
      }, 1000);
    }

    function updateTimerDisplay() {
      const el = document.getElementById('timer_display');
      if (el) {
        const mins = Math.floor(timeLeftSeconds / 60);
        const secs = timeLeftSeconds % 60;
        el.innerText = \`\${mins < 10 ? '0' : ''}\${mins}:\${secs < 10 ? '0' : ''}\${secs}\`;
      }
    }

    // --- STEP 3: RUNNING TEST ENGINE ---
    function renderTestRunningStep() {
      const qList = TEST_CONFIG.questions || [];
      const q = qList[currentQIndex];
      if (!q) return '<div class="p-6 text-center">No question available.</div>';

      const mins = Math.floor(timeLeftSeconds / 60);
      const secs = timeLeftSeconds % 60;
      const formattedTime = \`\${mins < 10 ? '0' : ''}\${mins}:\${secs < 10 ? '0' : ''}\${secs}\`;

      // Palette Badges
      let paletteHtml = qList.map((qItem, idx) => {
        const ans = userAnswers[idx];
        const isRev = reviewMarked[idx];
        const isCurr = idx === currentQIndex;

        let bgClass = 'bg-slate-800 text-slate-300 border-slate-700';
        if (isRev && ans) {
          bgClass = 'bg-purple-600 text-white border-purple-400 font-bold'; // Answered & Review
        } else if (isRev) {
          bgClass = 'bg-indigo-600 text-white border-indigo-400 font-bold'; // Marked for Review
        } else if (ans) {
          bgClass = 'bg-emerald-600 text-white border-emerald-400 font-bold'; // Answered
        } else {
          bgClass = 'bg-rose-600/80 text-white border-rose-500/50'; // Unanswered
        }

        if (isCurr) {
          bgClass += ' ring-2 ring-blue-400 scale-105 z-10';
        }

        return \`
          <button onclick="gotoQuestion(\${idx})" class="w-9 h-9 rounded-lg border text-xs font-semibold flex items-center justify-center transition shadow-sm \${bgClass}">
            \${idx + 1}
          </button>
        \`;
      }).join('');

      // Options Html
      const options = [
        { key: 'A', text: q.optionA },
        { key: 'B', text: q.optionB },
        { key: 'C', text: q.optionC },
        { key: 'D', text: q.optionD }
      ];

      const currentSelected = userAnswers[currentQIndex];

      const optionsHtml = options.map(opt => {
        const isSelected = currentSelected === opt.key;
        return \`
          <button onclick="selectOption('\${opt.key}')" class="w-full text-left p-4 rounded-xl border transition flex items-start gap-3.5 \${isSelected ? 'bg-blue-600/20 border-blue-500 text-white shadow-lg ring-1 ring-blue-500' : 'bg-slate-800/60 border-slate-700/80 hover:bg-slate-800 text-slate-200'}">
            <span class="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center text-xs font-bold \${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'}">
              \${opt.key}
            </span>
            <span class="text-sm pt-0.5 leading-relaxed font-medium">\${escapeHtml(opt.text)}</span>
          </button>
        \`;
      }).join('');

      return \`
        <div class="space-y-4">
          <!-- TOP TEST CONTROL BAR -->
          <div class="bg-[#11183c] border border-slate-800 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-lg">
            <div class="flex items-center gap-3">
              <span class="text-xs font-bold px-2.5 py-1 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20">
                Question \${currentQIndex + 1} of \${qList.length}
              </span>
              <span class="text-xs text-slate-400 hidden sm:inline">Subject: <b class="text-slate-200">\${escapeHtml(q.subject || 'General')}</b></span>
            </div>

            <div class="flex items-center gap-4">
              <!-- Hindi / English Switch -->
              \${q.translation ? \`
                <button onclick="toggleLanguage()" class="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs font-bold text-amber-400 hover:bg-slate-700 transition">
                  🌐 \${isLanguageHindi ? 'Switch to English' : 'हिंदी अनुवाद देखें'}
                </button>
              \` : ''}

              <!-- TIMER DISPLAY -->
              <div class="flex items-center gap-2 bg-slate-900 border border-slate-700 px-3.5 py-1.5 rounded-lg">
                <span class="text-xs text-slate-400 font-medium">Time Left:</span>
                <span id="timer_display" class="font-mono text-base font-bold text-emerald-400">\${formattedTime}</span>
              </div>

              <button onclick="submitTest()" class="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md transition">
                Submit Test 🏁
              </button>
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <!-- MAIN QUESTION CARD -->
            <div class="lg:col-span-3 space-y-4">
              <div class="bg-[#11183c] border border-slate-800 rounded-2xl p-5 sm:p-7 shadow-xl space-y-6">
                <!-- Question Heading -->
                <div class="space-y-3 border-b border-slate-800 pb-4">
                  <div class="flex items-center justify-between text-xs text-slate-400">
                    <span class="font-bold text-blue-400">Q.\${currentQIndex + 1}</span>
                    <span class="text-slate-400">+\${TEST_CONFIG.marksPerQuestion} Marks | -\${TEST_CONFIG.negativeMarksPerQuestion} Negative</span>
                  </div>

                  <p class="text-base sm:text-lg font-semibold text-white leading-relaxed">
                    \${isLanguageHindi && q.translation ? escapeHtml(q.translation) : escapeHtml(q.question)}
                  </p>
                </div>

                <!-- OPTIONS -->
                <div class="space-y-3">
                  \${optionsHtml}
                </div>

                <!-- BOTTOM ACTION BUTTONS -->
                <div class="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <div class="flex items-center gap-2">
                    <button onclick="clearResponse()" class="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition">
                      Clear Selection
                    </button>
                    <button onclick="toggleMarkForReview()" class="px-3.5 py-2 rounded-xl border text-xs font-semibold transition \${reviewMarked[currentQIndex] ? 'bg-purple-600 text-white border-purple-500' : 'bg-slate-800 text-purple-300 border-slate-700 hover:bg-slate-700'}">
                      \${reviewMarked[currentQIndex] ? '✓ Marked for Review' : 'Mark for Review'}
                    </button>
                  </div>

                  <div class="flex items-center gap-2">
                    <button onclick="prevQuestion()" \${currentQIndex === 0 ? 'disabled' : ''} class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white text-xs font-bold border border-slate-700 transition">
                      ← Previous
                    </button>
                    <button onclick="nextQuestion()" class="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md transition">
                      \${currentQIndex === qList.length - 1 ? 'Save & Review' : 'Save & Next →'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- RIGHT QUESTION PALETTE SIDEBAR -->
            <div class="lg:col-span-1 space-y-4">
              <div class="bg-[#11183c] border border-slate-800 rounded-2xl p-4 shadow-xl space-y-4">
                <h3 class="text-xs font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-2">
                  Question Palette (\${qList.length})
                </h3>

                <!-- Legend -->
                <div class="grid grid-cols-2 gap-2 text-[10px] text-slate-400">
                  <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Answered</span>
                  <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-rose-500"></span> Not Answered</span>
                  <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-indigo-500"></span> Review</span>
                  <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-slate-700"></span> Not Visited</span>
                </div>

                <!-- Palette Grid -->
                <div class="grid grid-cols-5 gap-2 max-h-[320px] overflow-y-auto p-1 custom-scrollbar">
                  \${paletteHtml}
                </div>

                <div class="pt-2 border-t border-slate-800">
                  <button onclick="submitTest()" class="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg transition">
                    Finish & Submit Test
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      \`;
    }

    function gotoQuestion(idx) {
      currentQIndex = idx;
      renderApp();
    }

    function selectOption(key) {
      userAnswers[currentQIndex] = key;
      renderApp();
    }

    function clearResponse() {
      delete userAnswers[currentQIndex];
      renderApp();
    }

    function toggleMarkForReview() {
      reviewMarked[currentQIndex] = !reviewMarked[currentQIndex];
      renderApp();
    }

    function prevQuestion() {
      if (currentQIndex > 0) {
        currentQIndex--;
        renderApp();
      }
    }

    function nextQuestion() {
      if (currentQIndex < TEST_CONFIG.questions.length - 1) {
        currentQIndex++;
        renderApp();
      }
    }

    function toggleLanguage() {
      isLanguageHindi = !isLanguageHindi;
      renderApp();
    }

    // --- STEP 4: RESULT SCORECARD & SOLUTIONS ---
    function submitTest() {
      if (timerInterval) clearInterval(timerInterval);

      const qList = TEST_CONFIG.questions || [];
      const marksPerQ = TEST_CONFIG.marksPerQuestion || 2;
      const negMarksPerQ = TEST_CONFIG.negativeMarksPerQuestion || 0.5;

      let correct = 0;
      let incorrect = 0;
      let unattempted = 0;

      qList.forEach((q, idx) => {
        const userAns = userAnswers[idx];
        if (!userAns) {
          unattempted++;
        } else if (userAns === q.answer) {
          correct++;
        } else {
          incorrect++;
        }
      });

      const rawScore = (correct * marksPerQ) - (incorrect * negMarksPerQ);
      const totalMarks = qList.length * marksPerQ;
      const percentage = Math.max(0, Math.round((rawScore / totalMarks) * 100));

      submissionResult = {
        correct,
        incorrect,
        unattempted,
        score: Math.max(0, rawScore),
        totalMarks,
        percentage
      };

      // Auto Sync Result to Server Leaderboard if online
      syncResultToServer();

      currentStep = 'RESULT';
      renderApp();
    }

    function syncResultToServer() {
      if (!submissionResult) return;
      var syncStatusEl = document.getElementById('sync-status-badge');
      if (syncStatusEl) syncStatusEl.innerText = 'Syncing Live Leaderboard... ⏳';

      var originUrl = window.location.origin;
      var submitEndpoint = originUrl + '/api/online-mocks/' + (TEST_CONFIG.shareId || '') + '/submit';

      var payload = {
        shareId: TEST_CONFIG.shareId,
        testName: TEST_CONFIG.testName,
        studentName: studentDetails.name,
        mobileNo: studentDetails.mobile,
        state: studentDetails.state,
        district: studentDetails.district,
        socialsFollowed: true,
        answers: userAnswers,
        score: submissionResult.score,
        totalMarks: submissionResult.totalMarks,
        percentage: submissionResult.percentage,
        correctCount: submissionResult.correct,
        incorrectCount: submissionResult.incorrect,
        unattemptedCount: submissionResult.unattempted,
        timeTakenSeconds: ((TEST_CONFIG.duration || 60) * 60) - (timeLeftSeconds || 0)
      };

      fetch(submitEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function(res) {
        return res.json();
      }).then(function(data) {
        if (data && data.success) {
          if (syncStatusEl) syncStatusEl.innerText = '✅ Live Leaderboard Synced! Rank #' + (data.rank || 1);
        } else {
          if (syncStatusEl) syncStatusEl.innerText = '⚠️ Leaderboard Offline Sync Pending';
        }
      }).catch(function(err) {
        if (syncStatusEl) syncStatusEl.innerText = '⚠️ Leaderboard Offline Sync Pending';
      });
    }

    function sendWhatsappResult() {
      if (!submissionResult) return;
      var text = '🏆 *' + escapeJs(TEST_CONFIG.instituteName || 'Gradeup Study') + ' - MOCK TEST RESULT*\n' +
        '----------------------------------------\n' +
        '📝 *Test:* ' + escapeJs(TEST_CONFIG.testName) + '\n' +
        '👤 *Student Name:* ' + escapeJs(studentDetails.name) + '\n' +
        '📱 *Mobile:* ' + escapeJs(studentDetails.mobile) + '\n' +
        '📍 *District/State:* ' + escapeJs(studentDetails.district) + ', ' + escapeJs(studentDetails.state) + '\n\n' +
        '📊 *SCORE CARD:*\n' +
        '• Score: *' + submissionResult.score + ' / ' + submissionResult.totalMarks + '*\n' +
        '• Accuracy: *' + submissionResult.percentage + '%*\n' +
        '• Correct: ' + submissionResult.correct + ' | Incorrect: ' + submissionResult.incorrect + ' | Unattempted: ' + submissionResult.unattempted + '\n\n' +
        '✅ Submitted via Official Mock Test Portal';

      var waUrl = 'https://api.whatsapp.com/send?text=' + encodeURIComponent(text);
      window.open(waUrl, '_blank');
    }

    function renderResultStep() {
      if (!submissionResult) return '<div>No result data</div>';

      const res = submissionResult;
      const qList = TEST_CONFIG.questions || [];

      let solutionsHtml = qList.map((q, idx) => {
        const userAns = userAnswers[idx];
        const isCorrect = userAns === q.answer;
        const isSkipped = !userAns;

        let borderClass = 'border-slate-800 bg-slate-900/60';
        let badge = '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-700 text-slate-300">Unattempted</span>';

        if (isCorrect) {
          borderClass = 'border-emerald-500/40 bg-emerald-500/5';
          badge = '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400">Correct (+' + TEST_CONFIG.marksPerQuestion + ')</span>';
        } else if (!isSkipped) {
          borderClass = 'border-rose-500/40 bg-rose-500/5';
          badge = '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400">Incorrect (-' + TEST_CONFIG.negativeMarksPerQuestion + ')</span>';
        }

        const opts = [
          { key: 'A', text: q.optionA },
          { key: 'B', text: q.optionB },
          { key: 'C', text: q.optionC },
          { key: 'D', text: q.optionD }
        ];

        const optsHtml = opts.map(o => {
          let optBg = 'bg-slate-800/40 border-slate-700/60 text-slate-300';
          if (o.key === q.answer) {
            optBg = 'bg-emerald-600/20 border-emerald-500 text-emerald-300 font-bold'; // Correct option
          } else if (o.key === userAns && !isCorrect) {
            optBg = 'bg-rose-600/20 border-rose-500 text-rose-300 font-bold'; // Wrong user option
          }

          return \`
            <div class="p-3 rounded-lg border text-xs flex items-center justify-between \${optBg}">
              <span><b>\${o.key}.</b> \${escapeHtml(o.text)}</span>
              \${o.key === q.answer ? '<span class="text-emerald-400 font-bold">✓ Correct Answer</span>' : ''}
              \${o.key === userAns && !isCorrect ? '<span class="text-rose-400 font-bold">✗ Your Choice</span>' : ''}
            </div>
          \`;
        }).join('');

        return \`
          <div class="p-5 rounded-2xl border \${borderClass} space-y-3 print-card">
            <div class="flex items-center justify-between text-xs">
              <span class="font-bold text-slate-400">Question \${idx + 1}</span>
              \${badge}
            </div>
            <p class="text-sm font-semibold text-white">\${escapeHtml(q.question)}</p>
            \${q.translation ? '<p class="text-xs text-slate-400 italic">हिंदी: ' + escapeHtml(q.translation) + '</p>' : ''}

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              \${optsHtml}
            </div>

            \${q.explanation ? \`
              <div class="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300 mt-2">
                <b>💡 Explanation / Solution:</b> \${escapeHtml(q.explanation)}
              </div>
            \` : ''}
          </div>
        \`;
      }).join('');

      return \`
        <div class="max-w-4xl mx-auto space-y-6">
          <!-- SCORECARD SUMMARY HEADER -->
          <div class="bg-[#11183c] border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-center print-card">
            <div class="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center text-3xl mx-auto shadow-lg shadow-amber-500/20">
              🏆
            </div>

            <div>
              <h2 class="text-2xl font-extrabold text-white">\${escapeHtml(studentDetails.name)}'s Test Scorecard</h2>
              <p class="text-xs text-slate-400 mt-0.5">\${escapeHtml(TEST_CONFIG.testName)} | \${escapeHtml(studentDetails.district)}, \${escapeHtml(studentDetails.state)}</p>
            </div>

            <!-- SCORE METRICS GRID -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div class="p-4 rounded-2xl bg-slate-900 border border-slate-800 text-center">
                <p class="text-[10px] text-slate-400 font-semibold uppercase">Total Score</p>
                <p class="text-2xl font-black text-blue-400 mt-1">\${res.score} <span class="text-xs text-slate-500">/ \${res.totalMarks}</span></p>
              </div>

              <div class="p-4 rounded-2xl bg-slate-900 border border-slate-800 text-center">
                <p class="text-[10px] text-slate-400 font-semibold uppercase">Accuracy</p>
                <p class="text-2xl font-black text-emerald-400 mt-1">\${res.percentage}%</p>
              </div>

              <div class="p-4 rounded-2xl bg-slate-900 border border-slate-800 text-center">
                <p class="text-[10px] text-slate-400 font-semibold uppercase">Correct Answers</p>
                <p class="text-2xl font-black text-emerald-400 mt-1">\${res.correct}</p>
              </div>

              <div class="p-4 rounded-2xl bg-slate-900 border border-slate-800 text-center">
                <p class="text-[10px] text-slate-400 font-semibold uppercase">Incorrect Answers</p>
                <p class="text-2xl font-black text-rose-400 mt-1">\${res.incorrect}</p>
              </div>
            </div>

            <div class="pt-1 text-center">
              <span id="sync-status-badge" class="text-xs font-mono font-bold text-indigo-300 bg-indigo-950/60 border border-indigo-700/60 px-3 py-1.5 rounded-xl inline-block shadow">
                Syncing Live Leaderboard... ⏳
              </span>
            </div>

            <div class="flex flex-wrap items-center justify-center gap-3 no-print pt-2">
              <button onclick="sendWhatsappResult()" class="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg transition flex items-center gap-2">
                💬 Send Score to Teacher / Institute on WhatsApp
              </button>
              <button onclick="syncResultToServer()" class="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg transition flex items-center gap-2">
                🔄 Manual Retry Sync
              </button>
              <button onclick="window.print()" class="px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold shadow-lg transition flex items-center gap-2">
                🖨️ Print / Save PDF
              </button>
            </div>
          </div>

          <!-- DETAILED SOLUTIONS REVIEW -->
          <div class="space-y-4">
            <h3 class="text-base font-bold text-white flex items-center gap-2">
              <span>📖 Detailed Question Solutions & Explanations</span>
            </h3>
            <div class="space-y-4">
              \${solutionsHtml}
            </div>
          </div>
        </div>
      \`;
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function escapeJs(str) {
      if (!str) return '';
      return String(str).replace(/\\\\/g, '\\\\\\\\').replace(/'/g, "\\\\'");
    }

    // Initialize Page
    renderApp();
  </script>
</body>
</html>`;
}

export function downloadMockHtmlFile(config: OnlineMockConfig) {
  const htmlContent = generateMockTestHtmlString(config);
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const sanitizedName = (config.testName || 'Online_Mock_Test').replace(/[^a-zA-Z0-9_\-]/g, '_');
  link.download = `${sanitizedName}.html`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
