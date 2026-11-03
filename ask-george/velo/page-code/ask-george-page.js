// Ask George — page code. Paste into the code panel of the "Ask George" page.
// Elements needed on the page (set these IDs in the editor):
//   #questionInput    Text Box   — where the member types (Arabic or English)
//   #askButton        Button     — "اسأل · Ask (1)"
//   #planButton       Button     — "خطة كاملة · Full plan (5)"
//   #interviewButton  Button     — "انترفيو كامل · Full interview (5)"
//   #roadmapButton    Button     — "طلّعلي الخطة · Give me my roadmap" (shown during an interview)
//   #answerText       Text       — shows the answer / interview question
//   #creditsText      Text       — remaining credits
//   #statusText       Text       — loading / error messages
//   #loginButton      Button     — "سجّل دخول · Log in" (shown to visitors)
//   #buyBasic         Button     — "Basic $10/mo"
//   #buyPro           Button     — "Pro $25/mo"
//   #buyTopup         Button     — "+40 credits $5"

import { authentication, currentMember } from 'wix-members-frontend';
import { checkout } from 'wix-pricing-plans-frontend';
import { askGeorge, getMyCredits } from 'backend/askGeorge.web';

const PLAN_IDS = {
  basic: '3a80985a-2919-4827-ba96-9277062e871c',
  pro: '8f123565-cdb9-4c75-83fe-2dbcb7dcf9a5',
  topup: 'a72f3785-04c7-494b-b6b6-74800103fbac',
};

// Interview state for this page visit.
let interviewSession = null;
let uiArabic = true;

function isArabic(text) {
  const s = text || '';
  return (s.match(/[؀-ۿ]/g) || []).length >= (s.match(/[A-Za-z]/g) || []).length;
}

function t(ar, en) {
  return uiArabic ? ar : en;
}

function showCredits(c) {
  if (!c) return;
  const plan = c.planName ? t(`باقة ${c.planName}`, `${c.planName} plan`) : t('مفيش اشتراك شهري', 'No monthly plan');
  const topup = c.topupLeft ? t(` + ${c.topupLeft} إضافي`, ` + ${c.topupLeft} extra`) : '';
  $w('#creditsText').text = `${plan} — ${t('الكريديت المتبقي', 'credits left')}: ${c.monthlyLeft}${topup}`;
}

async function refreshCredits() {
  try {
    showCredits(await getMyCredits());
  } catch (e) {
    $w('#creditsText').text = '';
  }
}

function setInterviewUI(active) {
  if (active) {
    $w('#roadmapButton').show();
    $w('#planButton').hide();
    $w('#interviewButton').label = t('إنهاء الانترفيو', 'End interview');
    $w('#askButton').label = t('ابعت', 'Send');
  } else {
    interviewSession = null;
    $w('#roadmapButton').hide();
    $w('#planButton').show();
    $w('#interviewButton').label = t('انترفيو كامل (5)', 'Full interview (5)');
    $w('#askButton').label = t('اسأل (1)', 'Ask (1)');
  }
}

async function setLoggedInUI() {
  const member = await currentMember.getMember();
  if (member) {
    $w('#loginButton').hide();
    await refreshCredits();
  } else {
    $w('#loginButton').show();
    $w('#creditsText').text = t('سجّل دخول عشان تسأل.', 'Log in to ask.');
  }
  return !!member;
}

async function buy(planId) {
  if (!(await currentMember.getMember())) {
    await authentication.promptLogin();
  }
  try {
    await checkout.startOnlinePurchase(planId);
    $w('#statusText').text = t('تمام! الكريديت هيظهر خلال لحظات.', 'Done! Your credits will show in a moment.');
    await refreshCredits();
  } catch (e) {
    console.error(e);
    $w('#statusText').text = t('الدفع ما كملش. جرّب تاني.', 'Payment was not completed. Please try again.');
  }
}

function setBusy(busy) {
  ['#askButton', '#planButton', '#interviewButton', '#roadmapButton'].forEach((id) =>
    busy ? $w(id).disable() : $w(id).enable()
  );
}

async function send(mode, overrideText) {
  if (!(await currentMember.getMember())) {
    await authentication.promptLogin();
    return;
  }
  const text = (overrideText || $w('#questionInput').value || '').trim();
  if (!text) {
    $w('#statusText').text = t('اكتب سؤالك الأول.', 'Please type your question first.');
    return;
  }
  uiArabic = isArabic(text);
  setBusy(true);
  $w('#statusText').text =
    mode === 'plan' ? t('بجهزلك الخطة...', 'Preparing your plan...') : t('بفكر...', 'Thinking...');
  try {
    const res = await askGeorge(text, mode, mode === 'interview' ? interviewSession : null);
    if (res.ok) {
      $w('#answerText').text = res.answer;
      $w('#questionInput').value = '';
      showCredits(res.credits);
      if (res.mode === 'interview') {
        interviewSession = res.sessionId;
        if (res.interviewDone) {
          setInterviewUI(false);
          $w('#statusText').text = t('دي خطتك. اتحفظت في ملفك عشان الإجابات الجاية تبقى على مقاسك.', 'Here is your roadmap. Your profile is saved so future answers fit you.');
        } else {
          setInterviewUI(true);
          $w('#statusText').text = t(`انترفيو — فاضل ${res.turnsLeft} رد`, `Interview — ${res.turnsLeft} replies left`);
        }
      } else {
        $w('#statusText').text = '';
      }
    } else {
      $w('#statusText').text = res.error || t('حصلت مشكلة.', 'Something went wrong.');
      if (res.interviewDone) setInterviewUI(false);
      if (res.credits) showCredits(res.credits);
    }
  } catch (e) {
    console.error(e);
    $w('#statusText').text = t('حصلت مشكلة في الاتصال. مفيش كريديت اتخصم.', 'Connection problem. No credits were used.');
  } finally {
    setBusy(false);
  }
}

$w.onReady(async () => {
  $w('#statusText').text = '';
  setInterviewUI(false);
  await setLoggedInUI();
  authentication.onLogin(() => setLoggedInUI());

  $w('#loginButton').onClick(() => authentication.promptLogin());
  $w('#askButton').onClick(() => send(interviewSession ? 'interview' : 'quick'));
  $w('#planButton').onClick(() => send('plan'));
  $w('#interviewButton').onClick(() => {
    if (interviewSession) {
      setInterviewUI(false);
      $w('#statusText').text = t('الانترفيو اتقفل.', 'Interview closed.');
      return;
    }
    // Start: use what they typed, or a default opener in the page language.
    const typed = ($w('#questionInput').value || '').trim();
    send('interview', typed || t('عايز أبدأ الانترفيو', "I'd like to start the interview"));
  });
  $w('#roadmapButton').onClick(() =>
    send('interview', t('كفاية أسئلة، طلّعلي الخطة دلوقتي.', "That's enough questions — please give me my roadmap now."))
  );
  $w('#buyBasic').onClick(() => buy(PLAN_IDS.basic));
  $w('#buyPro').onClick(() => buy(PLAN_IDS.pro));
  $w('#buyTopup').onClick(() => buy(PLAN_IDS.topup));
});
