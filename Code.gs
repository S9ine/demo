// 1. เปลี่ยน ID โฟลเดอร์เป็นตัวที่คุณให้มา (ต้องแน่ใจว่าโฟลเดอร์นี้เปิดแชร์ให้เขียนไฟล์ได้)
const FOLDER_ID = "11FbhFsl5ytfF8T3B1Bg5At3vNWd8a3kC";

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Index')
      .setTitle('ระบบบริหารจัดการสมาคมสุสาน')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ==========================================
// ส่วนที่ 0: ฟังก์ชันติดตั้งระบบ (ต้องรันฟังก์ชันนี้ 1 ครั้งในครั้งแรกที่ติดตั้ง)
// ==========================================
function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // สร้างตารางที่จำเป็น
  const sheets = [
    { name: 'Users', headers: ['UserID', 'Username', 'Password', 'Name', 'Role'] },
    { name: 'Sessions', headers: ['Token', 'Username', 'Name', 'CreatedAt', 'LastActive'] },
    { name: 'Members', headers: ['ID', 'Name', 'CID', 'Phone', 'AddressJSON', 'Timestamp'] },
    { name: 'Plots', headers: ['PlotID', 'Row', 'Col', 'Type', 'Status', 'RelativeID', 'DeceasedName', 'DeathDate', 'ExpiryDate', 'AutoRenew', 'ImageUrl', 'Timestamp'] },
    { name: 'Payments', headers: ['ReceiptID', 'Date', 'MemberID', 'PlotID', 'FeeType', 'Year', 'Amount', 'Note', 'Timestamp'] }
  ];

  sheets.forEach(s => {
    let sheet = ss.getSheetByName(s.name);
    if (!sheet) {
      sheet = ss.insertSheet(s.name);
      sheet.appendRow(s.headers);
      if (s.name === 'Users') {
        // สร้างบัญชี Admin เริ่มต้น (admin / 112233)
        sheet.appendRow(['U001', 'admin', '112233', 'ผู้ดูแลระบบสูงสุด', 'Admin']);
      }
    }
  });

  return "ติดตั้งฐานข้อมูลเสร็จสมบูรณ์แล้ว! รีเฟรชหน้าเว็บและลองล็อกอินด้วย admin / 112233 นะครับ";
}

// ฟังก์ชันช่วยดึง Object ฐานข้อมูล
function getDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return {
    users: ss.getSheetByName('Users'),
    sessions: ss.getSheetByName('Sessions'),
    members: ss.getSheetByName('Members'),
    plots: ss.getSheetByName('Plots'),
    payments: ss.getSheetByName('Payments')
  };
}

// ==========================================
// ส่วนที่ 1: ระบบ Authentication & Sessions
// ==========================================
function loginUser(username, password) {
  const db = getDatabase();
  if (!db.users) return { success: false, message: 'ไม่พบตาราง Users กรุณารัน setupDatabase' };
  
  const usersData = getSheetData(db.users);
  for (let i = 0; i < usersData.length; i++) {
    // ใช้ == เพื่อรองรับทั้งตัวเลขและข้อความ และตัดช่องว่าง
    if (usersData[i][1].toString().trim() == username && 
        usersData[i][2].toString().trim() == password) {
      
      const token = Utilities.getUuid();
      const name = usersData[i][3];
      db.sessions.appendRow([token, username, name, new Date(), new Date()]);
      return { success: true, token: token, user: { name: name, username: username } };
    }
  }
  return { success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
}

function validateSession(token) {
  const db = getDatabase();
  const sessionsData = db.sessions.getDataRange().getValues();
  for (let i = 1; i < sessionsData.length; i++) {
    if (sessionsData[i][0] === token) {
      db.sessions.getRange(i + 1, 5).setValue(new Date()); // อัปเดตเวลาใช้งานล่าสุด
      return { valid: true, user: { name: sessionsData[i][2], username: sessionsData[i][1] } };
    }
  }
  return { valid: false };
}

function logoutUser(token) {
   const db = getDatabase();
   const sessionsData = db.sessions.getDataRange().getValues();
   for (let i = 1; i < sessionsData.length; i++) {
     if (sessionsData[i][0] === token) {
       db.sessions.deleteRow(i + 1); 
       break;
     }
   }
   return { success: true };
}

// ==========================================
// ส่วนที่ 2: ฟังก์ชันดึงข้อมูลหลัก (หัวใจของการโหลดข้อมูล)
// ==========================================
function getInitialData() {
  const db = getDatabase();
  
  // ดึงข้อมูลสมาชิก
  const members = getSheetData(db.members).map(row => {
    let parsedAddress = { no: '', sub: '', dist: '', prov: '', zip: '' };
    try { if (row[4]) parsedAddress = JSON.parse(row[4]); } catch(e) {}
    return { id: row[0], name: row[1], cid: row[2], phone: row[3], address: parsedAddress };
  });

  // ดึงข้อมูลพื้นที่ (Plots)
  const plots = getSheetData(db.plots).map(row => ({
    id: row[0], row: row[1], col: row[2], type: row[3], status: row[4],
    relativeId: row[5], deceasedName: row[6], deathDate: row[7],
    expiryDate: row[8], autoRenew: (row[9] === true || row[9] === 'true'), 
    image: row[10] || null
  }));

  // ดึงข้อมูลการเงิน
  const payments = getSheetData(db.payments).map(row => ({
    id: row[0], date: row[1], memberId: row[2], plotId: row[3],
    type: row[4], year: row[5], amount: row[6], note: row[7]
  }));

  return { members, plots, payments };
}

// ฟังก์ชันช่วยดึงข้อมูลจาก Sheet (ข้ามหัวตาราง)
function getSheetData(sheet) {
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return []; 
  return sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
}

// ==========================================
// ส่วนที่ 3: ฟังก์ชันบันทึกข้อมูล (Create/Update)
// ==========================================

function saveMember(data) {
  const db = getDatabase();
  db.members.appendRow([data.id, data.name, data.cid, data.phone, JSON.stringify(data.address), new Date()]);
  return { success: true };
}

function savePlot(data) {
  const db = getDatabase();
  const sheet = db.plots;
  
  let finalImageUrl = data.image; // รักษาค่าเดิม (Link หรือ Base64 เก่า)

  // ถ้าเป็นภาพใหม่ที่ส่งมาแบบ Base64 ให้ทำการบันทึกลง Google Drive
  if (data.image && data.image.toString().startsWith('data:image')) {
    try {
      const folder = DriveApp.getFolderById(FOLDER_ID);
      const contentType = data.image.substring(5, data.image.indexOf(';'));
      const bytes = Utilities.base64Decode(data.image.split(',')[1]);
      const blob = Utilities.newBlob(bytes, contentType, `plot_${data.id}_${Date.now()}.jpg`);
      
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); 
      finalImageUrl = file.getUrl(); // เปลี่ยนข้อมูลที่จะเซฟใน Sheet เป็นลิงก์ไฟล์บน Drive แทน
    } catch (e) {
      Logger.log("Drive Error: " + e.toString());
    }
  }

  const dataRange = sheet.getDataRange().getValues();
  let rowIndex = -1;
  for (let i = 1; i < dataRange.length; i++) {
    if (dataRange[i][0] === data.id) { 
      rowIndex = i + 1;
      break; 
    }
  }

  const rowData = [
    data.id, data.row, data.col, data.type, data.status, 
    data.relativeId, data.deceasedName, data.deathDate, 
    data.expiryDate, data.autoRenew, finalImageUrl, new Date()
  ];

  if (rowIndex > -1) {
    sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }
  return { success: true, imageUrl: finalImageUrl };
}

function savePayment(data) {
  const db = getDatabase();
  db.payments.appendRow([data.id, data.date, data.memberId, data.plotId, data.type, data.year, data.amount, data.note, new Date()]);
  return { success: true };
}
