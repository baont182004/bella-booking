const bellaRoomImages = {
  "garden-family-room": [
    "/bella/garden-family-room/garden-family-room-01.jpg",
    "/bella/garden-family-room/garden-family-room-02.jpg",
  ],
  "balcony-twin-room": [
    "/bella/balcony-twin-room/balcony-twin-room-01.jpg",
    "/bella/balcony-twin-room/balcony-twin-room-02.jpg",
    "/bella/balcony-twin-room/balcony-twin-room-03.jpg",
  ],
  "sea-view-double-or-twin-room": [
    "/bella/sea-view-double-or-twin-room/sea-view-double-or-twin-room-01.jpg",
    "/bella/sea-view-double-or-twin-room/sea-view-double-or-twin-room-02.jpg",
    "/bella/sea-view-double-or-twin-room/sea-view-double-or-twin-room-03.jpg",
    "/bella/sea-view-double-or-twin-room/sea-view-double-or-twin-room-04.jpg",
    "/bella/sea-view-double-or-twin-room/sea-view-double-or-twin-room05.jpg",
  ],
  "sea-view-studio": [
    "/bella/sea-view-studio/sea-view-studio-01.jpg",
    "/bella/sea-view-studio/sea-view-studio-02.jpg",
    "/bella/sea-view-studio/sea-view-studio-03.jpg",
  ],
  "side-sea-view-deluxe-double-room": [
    "/bella/side-sea-view-deluxe-double-room/side-sea-view-deluxe-double-room-01.jpg",
    "/bella/side-sea-view-deluxe-double-room/side-sea-view-deluxe-double-room-02.jpg",
  ],
  "two-bedroom-sea-view-apartment": [
    "/bella/two-bedroom-sea-view-apartment/two-bedroom-sea-view-apartment-01.jpg",
    "/bella/two-bedroom-sea-view-apartment/two-bedroom-sea-view-apartment-02.jpg",
    "/bella/two-bedroom-sea-view-apartment/two-bedroom-sea-view-apartment-03.jpg",
    "/bella/two-bedroom-sea-view-apartment/two-bedroom-sea-view-apartment-04.jpg",
    "/bella/two-bedroom-sea-view-apartment/two-bedroom-sea-view-apartment-05.jpg",
  ],
};

export function getBellaRoomImages(code) {
  return bellaRoomImages[code] || [];
}
