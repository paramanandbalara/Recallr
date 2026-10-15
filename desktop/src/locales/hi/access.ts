// Hindi for the app's screens (access). Keys are the English text exactly as written in the code.
export const access: Record<string, string> = {
  // Window
  'Hide': 'छिपाएँ',
  'Quit': 'बंद करें',

  // Sign in
  'Sign in to Recallr': 'Recallr में साइन इन करें',
  'Use the email and password of your Recallr account.': 'अपने Recallr अकाउंट का ईमेल और पासवर्ड डालें।',
  'Email': 'ईमेल',
  'Password': 'पासवर्ड',
  'Could not sign in.': 'साइन इन नहीं हो सका।',
  '· last used {date}': '· आखिरी बार {date} को इस्तेमाल हुआ',
  'Remove one on the website': 'वेबसाइट पर कोई एक हटाएँ',
  'Sign in': 'साइन इन करें',
  'No account yet?': 'अभी तक अकाउंट नहीं है?',
  'Create one free': 'फ़्री में अकाउंट बनाएँ',
  '(your free trial starts on first sign-in)': '(पहली बार साइन इन करते ही आपका फ़्री ट्रायल शुरू हो जाएगा)',
  'Forgot your password?': 'पासवर्ड भूल गए?',

  // Account check
  'This computer was signed out from your account (on the website, or after a password change). Sign in again to continue.':
    'इस कंप्यूटर को आपके अकाउंट से साइन आउट कर दिया गया है (वेबसाइट से, या पासवर्ड बदलने के बाद)। आगे बढ़ने के लिए फिर से साइन इन करें।',
  'Could not check your account.': 'आपका अकाउंट चेक नहीं हो सका।',
  'Checking your account...': 'आपका अकाउंट चेक हो रहा है...',
  "Can't check your account": 'अकाउंट चेक नहीं हो पा रहा',
  'Try again': 'फिर से कोशिश करें',
  'Sign out': 'साइन आउट करें',
  'Access turned off': 'एक्सेस बंद कर दिया गया है',
  'Contact support if you think this is a mistake.': 'अगर आपको लगता है कि यह गलती है, तो सपोर्ट से संपर्क करें।',

  // Update required
  'Update Recallr to continue': 'आगे बढ़ने के लिए Recallr अपडेट करें',
  'This version ({current}) is no longer supported. Install version {version} to keep using Recallr. Your profiles and history are kept.':
    'यह वर्ज़न ({current}) अब सपोर्ट नहीं होता। Recallr इस्तेमाल करते रहने के लिए वर्ज़न {version} इंस्टॉल करें। आपकी प्रोफ़ाइल और हिस्ट्री सुरक्षित रहेंगी।',
  "What's new: {notes}": 'नया क्या है: {notes}',
  'Download the update': 'अपडेट डाउनलोड करें',

  // No plan
  'Choose a plan to continue': 'आगे बढ़ने के लिए प्लान चुनें',
  'This computer has already used a free trial (with another account), so there is no trial for this one.':
    'इस कंप्यूटर पर पहले ही (किसी दूसरे अकाउंट से) फ़्री ट्रायल इस्तेमाल हो चुका है, इसलिए इस अकाउंट को ट्रायल नहीं मिलेगा।',
  '{email} has no active plan: the free trial is over.': '{email} का कोई चालू प्लान नहीं है: फ़्री ट्रायल खत्म हो गया है।',
  '{email} has no active plan (or it has ended).': '{email} का कोई चालू प्लान नहीं है (या वह खत्म हो गया है)।',
  "Buy one on the website: Recallr opens as soon as it's paid, or once an offline payment is confirmed.":
    'वेबसाइट पर प्लान खरीदें: पेमेंट होते ही Recallr खुल जाएगा, या ऑफ़लाइन पेमेंट कन्फ़र्म होने पर।',
  'See plans': 'प्लान देखें',
  "I've paid, check again": 'मैंने पेमेंट कर दिया है, फिर से चेक करें',

  // Onboarding
  'Resume & job': 'रिज़्यूमे और जॉब',
  'Answers': 'जवाब',
  'Setup · step {step} of {total}': 'सेटअप · स्टेप {step} / {total}',
  'Welcome, {name}': 'स्वागत है, {name}',
  'Recallr listens to the conversation and suggests answers based on your resume and the answers you prepared.':
    'Recallr बातचीत सुनता है और आपके रिज़्यूमे और आपके तैयार किए हुए जवाबों के आधार पर जवाब सुझाता है।',
  'Your free trial is active: try it with a "Mock interview" first (in the main window after setup).':
    'आपका फ़्री ट्रायल चालू है: पहले "मॉक इंटरव्यू" से आज़माकर देखें (सेटअप के बाद मुख्य विंडो में)।',
  'Answers are built only from facts in your resume.': 'जवाब सिर्फ़ आपके रिज़्यूमे की जानकारी से ही बनते हैं।',
  'Your resume': 'आपका रिज़्यूमे',
  'Fills "[company name]" in your prepared answers.': 'आपके तैयार जवाबों में "[company name]" की जगह यह भरा जाएगा।',
  'Company name': 'कंपनी का नाम',
  'e.g. Shopify': 'जैसे Shopify',
  'Job description': 'जॉब डिस्क्रिप्शन',
  'Paste the job description here...': 'जॉब डिस्क्रिप्शन यहाँ पेस्ट करें...',
  "Add the answers you've prepared, like “Tell me about yourself”. Optional, you can do this later in Settings.":
    'अपने तैयार किए हुए जवाब जोड़ें, जैसे “Tell me about yourself”। यह ज़रूरी नहीं है, आप इसे बाद में सेटिंग्स में भी कर सकते हैं।',
  'Prepared answers': 'तैयार जवाब',
  'Back': 'पीछे',
  'Skip': 'छोड़ें',
  'Finish setup': 'सेटअप पूरा करें',
  'Next': 'अगला',

  // Errors from the services
  'Open Settings → Account to buy more.': 'और खरीदने के लिए सेटिंग्स → अकाउंट खोलें।',
  'Unknown error talking to the AI.': 'AI से बात करते समय कोई अनजान गड़बड़ी हुई।',
  'Please sign in again. Recallr now links your sign-in to this computer, and this one was made before that.':
    'कृपया फिर से साइन इन करें। अब Recallr आपके साइन इन को इस कंप्यूटर से जोड़ता है, और आपका यह साइन इन उससे पहले का है।',
  "Can't reach Recallr. Check your internet connection.": 'Recallr से कनेक्ट नहीं हो पा रहा। अपना इंटरनेट कनेक्शन चेक करें।',
  "Recallr's server had a problem ({status}).": 'Recallr के सर्वर में कोई दिक्कत आई ({status})।',
};
