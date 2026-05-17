# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: bella.e2e.spec.js >> BELLA demo and staging flows >> admin can update booking status for a paid reservation
- Location: tests\e2e\bella.e2e.spec.js:185:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('[data-testid^=\'admin-booking-\']').filter({ hasText: 'BEL-20260416-9F3B3C' })
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('[data-testid^=\'admin-booking-\']').filter({ hasText: 'BEL-20260416-9F3B3C' })

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - generic [ref=e6]:
      - link "Bella Hotel Phu Quoc" [ref=e8] [cursor=pointer]:
        - /url: /
        - generic [ref=e10]: Bella Hotel Phu Quoc
      - navigation "Điều hướng khách sạn" [ref=e11]:
        - link "Khách sạn" [ref=e12] [cursor=pointer]:
          - /url: /
        - link "Hạng phòng" [ref=e13] [cursor=pointer]:
          - /url: /rooms
        - link "Tiện nghi" [ref=e14] [cursor=pointer]:
          - /url: /#amenities
        - link "Vị trí" [ref=e15] [cursor=pointer]:
          - /url: /#location
        - link "Đánh giá" [ref=e16] [cursor=pointer]:
          - /url: /#reviews
        - link "Tra cứu đặt phòng" [ref=e17] [cursor=pointer]:
          - /url: /lookup
      - generic [ref=e18]:
        - link "Đăng nhập" [ref=e19] [cursor=pointer]:
          - /url: /login
        - link "Chọn hạng phòng" [ref=e20] [cursor=pointer]:
          - /url: /rooms
  - main [ref=e21]:
    - generic [ref=e23]:
      - complementary [ref=e24]:
        - paragraph [ref=e25]: Đăng nhập
        - heading "Tiếp tục kế hoạch lưu trú của bạn tại Bella." [level=1] [ref=e26]
        - paragraph [ref=e27]: Đăng nhập để xem đơn sắp tới, kiểm tra thanh toán và quản lý toàn bộ đặt phòng Bella trong cùng một nơi.
        - generic [ref=e28]:
          - generic [ref=e29]:
            - img [ref=e30]
            - generic [ref=e33]:
              - strong [ref=e34]: Theo dõi đơn lưu trú rõ ràng
              - text: Xem lại các lần ở trước đó và đơn sắp tới bất cứ khi nào cần.
          - generic [ref=e35]:
            - img [ref=e36]
            - generic [ref=e39]:
              - strong [ref=e40]: Quay lại bước đặt phòng nhanh hơn
              - text: Tiếp tục chọn hạng phòng Bella và hoàn tất kỳ nghỉ tiếp theo dễ dàng hơn.
      - generic [ref=e41]:
        - generic [ref=e43]:
          - paragraph [ref=e44]: Chào mừng quay lại
          - heading "Đăng nhập vào tài khoản đặt phòng Bella" [level=2] [ref=e45]
          - paragraph [ref=e46]: Sử dụng email và mật khẩu đã liên kết với tài khoản của bạn.
        - generic [ref=e47]:
          - generic [ref=e48]:
            - generic [ref=e49]: Email
            - generic [ref=e50]:
              - img [ref=e51]
              - textbox "Email Dùng đúng email đã liên kết với các đơn đặt phòng của bạn." [ref=e54]:
                - /placeholder: tenban@example.com
            - generic [ref=e55]: Dùng đúng email đã liên kết với các đơn đặt phòng của bạn.
          - generic [ref=e56]:
            - generic [ref=e57]: Mật khẩu
            - generic [ref=e58]:
              - img [ref=e59]
              - textbox "Mật khẩu Tài khoản sẽ giúp bạn theo dõi lưu trú, thanh toán và lịch sử đặt phòng tại Bella." [ref=e62]:
                - /placeholder: ••••••••
            - generic [ref=e63]: Tài khoản sẽ giúp bạn theo dõi lưu trú, thanh toán và lịch sử đặt phòng tại Bella.
          - button "Đăng nhập" [ref=e64] [cursor=pointer]:
            - img [ref=e65]
            - text: Đăng nhập
        - generic [ref=e68]:
          - img [ref=e69]
          - generic [ref=e72]: Xem đơn Bella, cập nhật thanh toán và lịch sử lưu trú trong cùng một tài khoản.
        - paragraph [ref=e73]:
          - text: Chưa có tài khoản Bella?
          - link "Tạo tài khoản" [ref=e74] [cursor=pointer]:
            - /url: /register
  - contentinfo [ref=e75]:
    - generic [ref=e77]:
      - generic [ref=e78]:
        - generic [ref=e79]:
          - link "Bella Hotel Phu Quoc" [ref=e80] [cursor=pointer]:
            - /url: /
            - generic [ref=e82]: Bella Hotel Phu Quoc
          - paragraph [ref=e83]: Khách sạn 3 sao tại An Thới với nhiều hạng phòng phù hợp cho cặp đôi, gia đình và nhóm bạn muốn nghỉ ngơi thoải mái gần các điểm đến nổi bật.
          - generic [ref=e85]:
            - img [ref=e86]
            - text: SOR209 Khu do thi Sun Premier Village Primavera, To 10, Khu, Dac khu Phu Quoc, An Thoi, Phu Quoc, Viet Nam
          - generic [ref=e89]:
            - link "Xem hạng phòng" [ref=e90] [cursor=pointer]:
              - /url: /rooms
            - link "Đăng nhập" [ref=e91] [cursor=pointer]:
              - /url: /login
        - generic [ref=e92]:
          - heading "Bella Hotel" [level=3] [ref=e93]
          - link "Trang giới thiệu" [ref=e94] [cursor=pointer]:
            - /url: /
          - link "Hạng phòng" [ref=e95] [cursor=pointer]:
            - /url: /rooms
          - link "Tiện nghi" [ref=e96] [cursor=pointer]:
            - /url: /#amenities
          - link "Hình ảnh" [ref=e97] [cursor=pointer]:
            - /url: /#gallery
        - generic [ref=e98]:
          - heading "Thông tin" [level=3] [ref=e99]
          - generic [ref=e100]:
            - img [ref=e101]
            - text: Điểm khách lưu trú 8.6/10 từ 104 đánh giá
          - generic [ref=e103]:
            - img [ref=e104]
            - text: Nhận phòng từ 14:00, trả phòng trước 00:00
          - generic [ref=e107]:
            - img [ref=e108]
            - text: Hỗ trợ English và Vietnamese
        - generic [ref=e112]:
          - heading "Liên hệ" [level=3] [ref=e113]
          - link "Vị trí khách sạn" [ref=e114] [cursor=pointer]:
            - /url: /#location
          - link "Đánh giá khách lưu trú" [ref=e115] [cursor=pointer]:
            - /url: /#reviews
          - link "Tư vấn chọn phòng" [ref=e116] [cursor=pointer]:
            - /url: /rooms
          - generic [ref=e117]: Khu vực An Thới, thuận tiện để khám phá Sunset Town và bờ biển phía Nam Phú Quốc.
      - generic [ref=e118]:
        - paragraph [ref=e119]: © 2026 Bella Hotel Phú Quốc.
        - paragraph [ref=e120]: Một khách sạn, một quy trình đặt phòng rõ ràng, một điểm đến dễ chọn.
```

# Test source

```ts
  92  |     await expect(page).toHaveURL(/\/dashboard/);
  93  |   });
  94  | 
  95  |   test("customer can browse room list and room detail", async ({ page }) => {
  96  |     await openRoom(page, state.successfulBookingRoomCode);
  97  |     await expect(page.getByRole("heading", { level: 1 })).toContainText("Sea View");
  98  |   });
  99  | 
  100 |   test("invalid booking input shows a validation message", async ({ page }) => {
  101 |     await login(page, "lana.nguyen@example.com", "Password123!");
  102 |     await openRoom(page, state.successfulBookingRoomCode);
  103 |     await fillBookingForm(page, {
  104 |       checkInDate: "2026-11-22",
  105 |       checkOutDate: "2026-11-22",
  106 |       promotionCode: "BELLA10",
  107 |     });
  108 |     await page.getByTestId("submit-booking").click();
  109 |     await expect(page.getByText("Ngày trả phòng phải sau ngày nhận phòng.")).toBeVisible();
  110 |   });
  111 | 
  112 |   test("customer can create a booking and complete a direct-success payment flow", async ({ page }) => {
  113 |     await login(page, "lana.nguyen@example.com", "Password123!");
  114 |     await openRoom(page, state.successfulBookingRoomCode);
  115 |     const bookingText = await createBooking(page, {
  116 |       checkInDate: "2026-11-20",
  117 |       checkOutDate: "2026-11-22",
  118 |       promotionCode: "BELLA10",
  119 |     });
  120 | 
  121 |     const referenceMatch = bookingText?.match(/BEL-\d{8}-[A-Z0-9]{6}/);
  122 |     expect(referenceMatch?.[0]).toBeTruthy();
  123 |     state.successfulBookingReference = referenceMatch[0];
  124 | 
  125 |     await payForBooking(page, "4111 1111 1111 1111");
  126 |     await expect(page.getByTestId("view-bookings-after-payment")).toBeVisible();
  127 |   });
  128 | 
  129 |   test("payment failures are shown and can be retried successfully", async ({ page }) => {
  130 |     await login(page, "lana.nguyen@example.com", "Password123!");
  131 |     await openRoom(page, state.retryBookingRoomCode);
  132 |     await createBooking(page, {
  133 |       checkInDate: "2026-11-24",
  134 |       checkOutDate: "2026-11-26",
  135 |     });
  136 | 
  137 |     await payForBooking(page, "4000 0000 0000 0002");
  138 |     await expect(page.getByTestId("payment-error")).toContainText("Demo payment declined");
  139 | 
  140 |     await payForBooking(page, "4111 1111 1111 1111");
  141 |     await expect(page.getByTestId("view-bookings-after-payment")).toBeVisible();
  142 |   });
  143 | 
  144 |   test("booking lookup and booking history work for the customer", async ({ page }) => {
  145 |     await page.goto("/lookup");
  146 |     await page.getByTestId("lookup-reference").fill(state.successfulBookingReference);
  147 |     await page.getByTestId("lookup-email").fill("lana.nguyen@example.com");
  148 |     await page.getByTestId("lookup-submit").click();
  149 |     await expect(page.getByTestId("lookup-result")).toContainText(state.successfulBookingReference);
  150 | 
  151 |     await login(page, "lana.nguyen@example.com", "Password123!");
  152 |     await page.goto("/bookings");
  153 |     await expect(page.getByTestId("bookings-grid")).toContainText(state.successfulBookingReference);
  154 |   });
  155 | 
  156 |   test("non-admin users are blocked from the admin area", async ({ page }) => {
  157 |     await login(page, "lana.nguyen@example.com", "Password123!");
  158 |     await page.goto("/admin");
  159 |     await expect(page).toHaveURL(/\/dashboard/);
  160 |   });
  161 | 
  162 |   test("admin can log in and manage rooms", async ({ page }) => {
  163 |     await login(page, "admin.bella@example.com", "Password123!");
  164 |     await page.goto("/admin");
  165 |     await expect(page).toHaveURL(/\/admin/);
  166 | 
  167 |     await page.getByTestId("admin-room-number").fill(state.adminRoomNumber);
  168 |     await page.getByTestId("admin-room-type").fill("E2E Demo Room");
  169 |     await page.getByTestId("admin-room-price").fill("1350000");
  170 |     await page.getByTestId("admin-room-capacity").fill("2");
  171 |     await page.getByTestId("admin-room-description").fill("Created by Playwright.");
  172 |     await page.getByTestId("admin-room-amenities").fill("wifi, minibar");
  173 |     await page.getByTestId("admin-create-room").click();
  174 | 
  175 |     const createdRoomCard = page.locator("[data-testid^='admin-room-']").filter({
  176 |       hasText: state.adminRoomNumber,
  177 |     });
  178 |     await expect(createdRoomCard).toBeVisible();
  179 |     await createdRoomCard.getByRole("button", { name: "Tạm khóa" }).click();
  180 |     await expect(createdRoomCard).toContainText("Đã khóa");
  181 |     await createdRoomCard.getByRole("button", { name: "Xóa" }).click();
  182 |     await expect(createdRoomCard).toHaveCount(0);
  183 |   });
  184 | 
  185 |   test("admin can update booking status for a paid reservation", async ({ page }) => {
  186 |     await login(page, "admin.bella@example.com", "Password123!");
  187 |     await page.goto("/admin");
  188 | 
  189 |     const bookingCard = page.locator("[data-testid^='admin-booking-']").filter({
  190 |       hasText: state.successfulBookingReference,
  191 |     });
> 192 |     await expect(bookingCard).toBeVisible();
      |                               ^ Error: expect(locator).toBeVisible() failed
  193 |     await bookingCard.getByRole("button", { name: "Hoàn tất" }).click();
  194 |     await expect(bookingCard).toContainText("Hoàn tất");
  195 |   });
  196 | });
  197 | 
```