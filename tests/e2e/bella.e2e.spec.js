import { expect, test } from "@playwright/test";

const state = {
  registeredEmail: "",
  registeredPassword: "Password123!",
  successfulBookingReference: "",
  successfulBookingRoomCode: "sea-view-double-or-twin-room",
  retryBookingRoomCode: "garden-family-room",
  adminRoomNumber: `E2E-${Date.now().toString().slice(-5)}`,
};

async function login(page, email, password) {
  await page.goto("/login");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
}

async function logout(page) {
  const logoutButton = page.getByRole("button", { name: "Đăng xuất" });
  if (await logoutButton.isVisible()) {
    await logoutButton.click();
  }
}

async function openRoom(page, roomCode) {
  await page.goto("/");
  await expect(page.getByTestId(`room-card-${roomCode}`)).toBeVisible();
  await page.getByTestId(`view-room-${roomCode}`).click();
  await expect(page).toHaveURL(new RegExp(`/rooms/${roomCode}`));
}

async function fillBookingForm(page, overrides = {}) {
  const values = {
    checkInDate: "2026-11-20",
    checkOutDate: "2026-11-22",
    numGuests: "2",
    guestFullName: "Lana Nguyen",
    guestEmail: "lana.nguyen@example.com",
    guestPhone: "+84901234567",
    promotionCode: "",
    ...overrides,
  };

  await page.getByTestId("booking-check-in").fill(values.checkInDate);
  await page.getByTestId("booking-check-out").fill(values.checkOutDate);
  await page.getByTestId("booking-guests").fill(values.numGuests);
  await page.getByTestId("booking-full-name").fill(values.guestFullName);
  await page.getByTestId("booking-email").fill(values.guestEmail);
  await page.getByTestId("booking-phone").fill(values.guestPhone);
  await page.getByTestId("booking-promotion-code").fill(values.promotionCode);
}

async function createBooking(page, overrides = {}) {
  await fillBookingForm(page, overrides);
  await page.getByTestId("check-availability").click();
  await expect(page.getByTestId("availability-result")).toBeVisible();
  await page.getByTestId("submit-booking").click();
  await expect(page.getByTestId("booking-result")).toBeVisible();
  return page.getByTestId("booking-result").textContent();
}

async function startHostedCheckout(page) {
  await page.getByTestId("start-hosted-checkout").click();
  await expect(page).toHaveURL(/3004\/payments\/hosted\/mock/);
}

async function completeMockCheckout(page, actionTestId) {
  await page.getByTestId(actionTestId).click();
  await expect(page).toHaveURL(/\/payments\/return/);
}

test.describe.serial("BELLA demo and staging flows", () => {
  test("customer can register, log in, and stay authenticated after refresh", async ({ page }) => {
    state.registeredEmail = `e2e.${Date.now()}@example.com`;

    await page.goto("/register");
    await page.getByTestId("register-first-name").fill("E2E");
    await page.getByTestId("register-last-name").fill("Customer");
    await page.getByTestId("register-email").fill(state.registeredEmail);
    await page.getByTestId("register-phone").fill("+84900000000");
    await page.getByTestId("register-password").fill(state.registeredPassword);
    await page.getByTestId("register-submit").click();

    await expect(page).toHaveURL(/\/dashboard/);
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText(state.registeredEmail)).toBeVisible();

    await logout(page);
    await expect(page).toHaveURL(/\/$/);

    await login(page, state.registeredEmail, state.registeredPassword);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("customer can browse room list and room detail", async ({ page }) => {
    await openRoom(page, state.successfulBookingRoomCode);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Sea View");
  });

  test("invalid booking input shows a validation message", async ({ page }) => {
    await login(page, "lana.nguyen@example.com", "Password123!");
    await openRoom(page, state.successfulBookingRoomCode);
    await fillBookingForm(page, {
      checkInDate: "2026-11-22",
      checkOutDate: "2026-11-22",
      promotionCode: "BELLA10",
    });
    await page.getByTestId("submit-booking").click();
    await expect(page.getByText("Ngày trả phòng phải sau ngày nhận phòng.")).toBeVisible();
  });

  test("customer can create a booking and complete a hosted-checkout success flow", async ({ page }) => {
    await login(page, "lana.nguyen@example.com", "Password123!");
    await openRoom(page, state.successfulBookingRoomCode);
    const bookingText = await createBooking(page, {
      checkInDate: "2026-11-20",
      checkOutDate: "2026-11-22",
      promotionCode: "BELLA10",
    });

    const referenceMatch = bookingText?.match(/BEL-\d{8}-[A-Z0-9]{6}/);
    expect(referenceMatch?.[0]).toBeTruthy();
    state.successfulBookingReference = referenceMatch[0];

    const checkoutRequestPromise = page.waitForRequest(
      (request) =>
        request.url().includes("/payments/checkout-sessions") && request.method() === "POST",
    );
    await startHostedCheckout(page);
    const checkoutRequest = await checkoutRequestPromise;
    const checkoutPayload = JSON.parse(checkoutRequest.postData() || "{}");
    expect(Object.keys(checkoutPayload).sort()).toEqual(
      ["billingEmail", "billingName", "bookingId"].sort(),
    );

    await completeMockCheckout(page, "mock-checkout-success-visa");
    await expect(page.getByTestId("payment-return-result")).toContainText("Đã thanh toán");
  });

  test("payment failures are shown and can be retried successfully", async ({ page }) => {
    await login(page, "lana.nguyen@example.com", "Password123!");
    await openRoom(page, state.retryBookingRoomCode);
    await createBooking(page, {
      checkInDate: "2026-11-24",
      checkOutDate: "2026-11-26",
    });

    await startHostedCheckout(page);
    await completeMockCheckout(page, "mock-checkout-fail");
    await expect(page.getByTestId("payment-return-result")).toContainText("Thất bại");

    await page.getByTestId("resume-checkout").click();
    await expect(page).toHaveURL(/3004\/payments\/hosted\/mock/);
    await completeMockCheckout(page, "mock-checkout-success-mastercard");
    await expect(page.getByTestId("payment-return-result")).toContainText("Đã thanh toán");
  });

  test("booking lookup and booking history work for the customer", async ({ page }) => {
    await page.goto("/lookup");
    await page.getByTestId("lookup-reference").fill(state.successfulBookingReference);
    await page.getByTestId("lookup-email").fill("lana.nguyen@example.com");
    await page.getByTestId("lookup-submit").click();
    await expect(page.getByTestId("lookup-result")).toContainText(state.successfulBookingReference);

    await login(page, "lana.nguyen@example.com", "Password123!");
    await page.goto("/bookings");
    await expect(page.getByTestId("bookings-grid")).toContainText(state.successfulBookingReference);
  });

  test("non-admin users are blocked from the admin area", async ({ page }) => {
    await login(page, "lana.nguyen@example.com", "Password123!");
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("admin can log in and manage rooms", async ({ page }) => {
    await login(page, "admin.bella@example.com", "Password123!");
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin/);

    await page.getByTestId("admin-room-number").fill(state.adminRoomNumber);
    await page.getByTestId("admin-room-type").fill("E2E Demo Room");
    await page.getByTestId("admin-room-price").fill("1350000");
    await page.getByTestId("admin-room-capacity").fill("2");
    await page.getByTestId("admin-room-description").fill("Created by Playwright.");
    await page.getByTestId("admin-room-amenities").fill("wifi, minibar");
    await page.getByTestId("admin-create-room").click();

    const createdRoomCard = page.locator("[data-testid^='admin-room-']").filter({
      hasText: state.adminRoomNumber,
    });
    await expect(createdRoomCard).toBeVisible();
    await createdRoomCard.getByRole("button", { name: "Tạm khóa" }).click();
    await expect(createdRoomCard).toContainText("Đã khóa");
    await createdRoomCard.getByRole("button", { name: "Xóa" }).click();
    await expect(createdRoomCard).toHaveCount(0);
  });

  test("admin can update booking status for a paid reservation", async ({ page }) => {
    await login(page, "admin.bella@example.com", "Password123!");
    await page.goto("/admin");

    const bookingCard = page.locator("[data-testid^='admin-booking-']").filter({
      hasText: state.successfulBookingReference,
    });
    await expect(bookingCard).toBeVisible();
    await bookingCard.getByRole("button", { name: "Hoàn tất" }).click();
    await expect(bookingCard).toContainText("Hoàn tất");
  });
});
