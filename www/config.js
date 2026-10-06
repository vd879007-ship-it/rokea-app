(function () {
  // Base64 Encoded Keys
  const _data = {
    "k1": "QUl6YVN5QlFjZERQUkNOZ0Y3eWZBSnBxZEgyRUZyaUdLVGR2TUtB", // Firebase Key
    "k2": "cm9rZXlhLTNjY2FhLmZpcmViYXNlYXBwLmNvbQ==",            // Auth Domain
    "k3": "cm9rZXlhLTNjY2Fh",                                   // Project ID
    "k4": "cm9rZXlhLTNjY2FhLmZpcmViYXNlc3RvcmFnZS5hcHA=",       // Storage Bucket
    "k5": "NDc0ODAxMDQzNDM2",                                   // Sender ID
    "k6": "MTo0NzQ4MDEwNDM0MzY6d2ViOmUxMmMwYmYyOTcwNGU0MzE5MDcyYzk=", // App ID
    "k7": "Ry1IMUdCSzgxRDFa",                                   // Measurement ID
    "k8": "cnpwX2xpdmVfU0VNU204aVBiVUtBdTk="                    // Razorpay ID
  };

  const decode = (s) => atob(s);

  window.process = {
    env: {
      FIREBASE_API_KEY: decode(_data.k1),
      FIREBASE_AUTH_DOMAIN: decode(_data.k2),
      FIREBASE_PROJECT_ID: decode(_data.k3),
      FIREBASE_STORAGE_BUCKET: decode(_data.k4),
      FIREBASE_MESSAGING_SENDER_ID: decode(_data.k5),
      FIREBASE_APP_ID: decode(_data.k6),
      FIREBASE_MEASUREMENT_ID: decode(_data.k7),
      RAZORPAY_KEY_ID: decode(_data.k8)
    }
  };
})();