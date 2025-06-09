function generateGoogleMeetLink() {
    const randomString = Math.random().toString(36).substring(2, 12);
    return `https://meet.google.com/${randomString}`;
  }
  
  module.exports = { generateGoogleMeetLink };
  