// Ask George — page code. Paste into the code panel of the "Ask George" page.
// Elements needed on the page (set these IDs in the editor):
//   #questionInput  Text Box        — where the member types the question
//   #askButton      Button          — "اسأل (1 كريديت)"
//   #planButton     Button          — "خطة كاملة (5 كريديت)"
//   #answerText     Text            — shows the answer
//   #creditsText    Text            — shows remaining credits
//   #statusText     Text            — loading / error messages
//   #loginButton    Button          — "سجّل دخول" (shown to visitors)
//   #buyBasic       Button          — "Basic $10/شهر"
//   #buyPro         Button          — "Pro $25/شهر"
//   #buyTopup       Button          — "40 كريديت إضافي $5"

import { authentication, currentMember } from 'wix-members-frontend';
import { checkout } from 'wix-pricing-plans-frontend';
import { askGeorge, getMyCredits } from 'backend/askGeorge.web';

const PLAN_IDS = {
  basic: '3a80985a-2919-4827-ba96-9277062e871c',
  pro: '8f123565-cdb9-4c75-83fe-2dbcb7dcf9a5',
  topup: 'a72f3785-04c7-494b-b6b6-74800103fbac',
};

function showCredits(c) {
  if (!c) return;
  const plan = c.planName ? `باقة ${c.planName}` : 'مفيش اشتراك شهري';
  const topup = c.topupLeft ? ` + ${c.topupLeft} إضافي` : '';
  $w('#creditsText').text = `${plan} — الكريديت المتبقي: ${c.monthlyLeft}${topup}`;
}

async function refreshCredits() {
  try {
    showCredits(await getMyCredits());
  } catch (e) {
    $w('#creditsText').text = '';
  }
}

async function setLoggedInUI() {
  const member = await currentMember.getMember();
  const loggedIn = !!member;
  if (loggedIn) {
    $w('#loginButton').hide();
    await refreshCredits();
  } else {
    $w('#loginButton').show();
    $w('#creditsText').text = 'سجّل دخول عشان تسأل.';
  }
  return loggedIn;
}

async function buy(planId) {
  if (!(await currentMember.getMember())) {
    await authentication.promptLogin();
  }
  try {
    await checkout.startOnlinePurchase(planId);
    $w('#statusText').text = 'تمام! الكريديت هيظهر خلال لحظات.';
    await refreshCredits();
  } catch (e) {
    console.error(e);
    $w('#statusText').text = 'الدفع ما كملش. جرّب تاني.';
  }
}

async function send(mode) {
  if (!(await currentMember.getMember())) {
    await authentication.promptLogin();
    return;
  }
  const question = $w('#questionInput').value;
  if (!question || !question.trim()) {
    $w('#statusText').text = 'اكتب سؤالك الأول.';
    return;
  }
  $w('#askButton').disable();
  $w('#planButton').disable();
  $w('#statusText').text = mode === 'plan' ? 'بجهزلك الخطة...' : 'بفكر في سؤالك...';
  try {
    const res = await askGeorge(question, mode);
    if (res.ok) {
      $w('#answerText').text = res.answer;
      $w('#statusText').text = '';
      $w('#questionInput').value = '';
      showCredits(res.credits);
    } else {
      $w('#statusText').text = res.error || 'حصلت مشكلة.';
      if (res.credits) showCredits(res.credits);
    }
  } catch (e) {
    console.error(e);
    $w('#statusText').text = 'حصلت مشكلة في الاتصال. مفيش كريديت اتخصم.';
  } finally {
    $w('#askButton').enable();
    $w('#planButton').enable();
  }
}

$w.onReady(async () => {
  $w('#statusText').text = '';
  await setLoggedInUI();
  authentication.onLogin(() => setLoggedInUI());

  $w('#loginButton').onClick(() => authentication.promptLogin());
  $w('#askButton').onClick(() => send('quick'));
  $w('#planButton').onClick(() => send('plan'));
  $w('#buyBasic').onClick(() => buy(PLAN_IDS.basic));
  $w('#buyPro').onClick(() => buy(PLAN_IDS.pro));
  $w('#buyTopup').onClick(() => buy(PLAN_IDS.topup));
});
