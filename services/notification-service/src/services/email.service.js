import nodemailer from 'nodemailer';

let transporter;

function initializeEmailService() {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  console.log('Email service initialized');
}

async function sendEmail({ to, subject, text, html }) {
  try {
    if (!transporter) {
      initializeEmailService();
    }

    const info = await transporter.sendMail({
      from: `"Hotel Booking System" <${process.env.SMTP_USER}>`,
      to,
      subject,
      text,
      html: html || text
    });

    console.log('Email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending email:', error);
    // Don't throw error to prevent service crash
    return { success: false, error: error.message };
  }
}

async function sendBookingConfirmation({ email, bookingId, hotelName, checkIn, checkOut, totalPrice }) {
  const subject = 'Booking Confirmation';
  const html = `
    <h1>Booking Confirmation</h1>
    <p>Your booking has been confirmed!</p>
    <h2>Booking Details:</h2>
    <ul>
      <li><strong>Booking ID:</strong> ${bookingId}</li>
      <li><strong>Hotel:</strong> ${hotelName || 'N/A'}</li>
      <li><strong>Check-in:</strong> ${checkIn || 'N/A'}</li>
      <li><strong>Check-out:</strong> ${checkOut || 'N/A'}</li>
      <li><strong>Total Price:</strong> $${totalPrice || 'N/A'}</li>
    </ul>
    <p>Thank you for choosing our service!</p>
  `;

  return await sendEmail({ to: email, subject, html });
}

async function sendPaymentConfirmation({ email, bookingId, amount, transactionId }) {
  const subject = 'Payment Confirmation';
  const html = `
    <h1>Payment Successful</h1>
    <p>Your payment has been processed successfully!</p>
    <h2>Payment Details:</h2>
    <ul>
      <li><strong>Booking ID:</strong> ${bookingId}</li>
      <li><strong>Amount:</strong> $${amount}</li>
      <li><strong>Transaction ID:</strong> ${transactionId}</li>
    </ul>
    <p>Thank you for your payment!</p>
  `;

  return await sendEmail({ to: email, subject, html });
}

async function sendBookingCancellation({ email, bookingId }) {
  const subject = 'Booking Cancellation';
  const html = `
    <h1>Booking Cancelled</h1>
    <p>Your booking has been cancelled.</p>
    <h2>Details:</h2>
    <ul>
      <li><strong>Booking ID:</strong> ${bookingId}</li>
    </ul>
    <p>If you did not request this cancellation, please contact us immediately.</p>
  `;

  return await sendEmail({ to: email, subject, html });
}

async function sendBookingRequestNotification({
  requestReference,
  roomName,
  checkIn,
  checkOut,
  nights,
  numGuests,
  guestFullName,
  guestPhone,
  guestArea,
  guestEmail,
  combo,
  note,
  estimatedTotal,
}) {
  const to = process.env.STAFF_NOTIFICATION_EMAIL || process.env.ADMIN_EMAIL || process.env.SMTP_USER;
  const subject = `Bella lead giữ chỗ mới: ${requestReference}`;
  const html = `
    <h1>Bella đã nhận yêu cầu giữ chỗ mới</h1>
    <h2>Thông tin yêu cầu</h2>
    <ul>
      <li><strong>Mã yêu cầu:</strong> ${requestReference}</li>
      <li><strong>Hạng phòng quan tâm:</strong> ${roomName || 'N/A'}</li>
      <li><strong>Ngày ở:</strong> ${checkIn || 'N/A'} - ${checkOut || 'N/A'} (${nights || 'N/A'} đêm)</li>
      <li><strong>Số khách:</strong> ${numGuests || 'N/A'}</li>
      <li><strong>Combo:</strong> ${combo?.name || 'Không chọn combo'}</li>
      <li><strong>Tạm tính:</strong> ${estimatedTotal || 0} VND</li>
    </ul>
    <h2>Thông tin khách</h2>
    <ul>
      <li><strong>Họ tên:</strong> ${guestFullName || 'N/A'}</li>
      <li><strong>Số điện thoại:</strong> ${guestPhone || 'N/A'}</li>
      <li><strong>Khu vực:</strong> ${guestArea || 'N/A'}</li>
      <li><strong>Email:</strong> ${guestEmail || 'Không cung cấp'}</li>
      <li><strong>Ghi chú:</strong> ${note || 'Không có'}</li>
    </ul>
  `;

  return await sendEmail({ to, subject, html });
}

export {
  initializeEmailService,
  sendEmail,
  sendBookingConfirmation,
  sendPaymentConfirmation,
  sendBookingCancellation,
  sendBookingRequestNotification
};
