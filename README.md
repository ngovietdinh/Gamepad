# Mảnh Ghép

Tranh ghép sơn mài và tangram cho iPad, tối ưu cho Apple Pencil. Ứng dụng web (PWA): mở bằng Safari, chọn **Chia sẻ → Thêm vào MH chính** để cài như app thật, chơi được cả khi không có mạng.

## Hai trò chơi

**Tranh ghép (jigsaw).** Có 5 bức tranh sơn mài do code tự vẽ: Vịnh Hạ Long, Phố cổ Hội An, Ruộng bậc thang, Đầm sen, Trăng rằm. Mỗi bức có 6 cấp: 12 → 20 → 35 → 48 → 70 → 108 mảnh, hai cấp cuối mảnh bị xoay ngẫu nhiên.
- Mảnh có răng cưa sinh ngẫu nhiên. Đặt gần đúng chỗ thì mảnh tự hút vào, các mảnh khớp nhau dính thành cụm.
- Có các công cụ: lọc mảnh viền, ảnh mờ làm nền, dồn mảnh, gợi ý.

**Ảnh động vật.** Gồm 50 ảnh chụp động vật thật, chia nhóm: 20 thú, 12 chim, 6 bò sát và lưỡng cư, 7 động vật dưới nước, 5 côn trùng. Mọi ảnh đều lấy từ bộ ảnh chọn lọc (Featured / Quality pictures) của Wikimedia Commons, dùng theo giấy phép tự do và có ghi tên tác giả trong game. Mỗi ảnh tự chọn 12, 35, 70, 108 hoặc 154 mảnh, có công tắc xoay mảnh.

**Ghép theo dáng con vật** (mặc định): con vật được tách khỏi nền bằng mô hình chạy lúc build. Bàn ghép là đúng hình bóng con vật, mép mảnh chạy theo đường viền. Ô nằm ngoài con vật bị bỏ, cạnh giáp ô bỏ được cắt thẳng. Mảnh chỉ dính chút lông được gắn sẵn vào mảnh kề, nên không có mảnh vụn và không mất phần nào của con vật. Ảnh dùng cho chế độ này cắt sát quanh con vật từ ảnh gốc độ phân giải cao, nên con vật nhỏ vẫn nét. Tắt công tắc để chơi khung chữ nhật như cũ.

Muốn đổi hoặc thêm ảnh thì sửa `scripts/animals/species.json` và `selection.json`, rồi chạy:

```bash
NODE_USE_ENV_PROXY=1 node scripts/animals/candidates.mjs   # tìm ảnh ứng viên trên Commons
NODE_USE_ENV_PROXY=1 node scripts/animals/build.mjs        # tải ảnh 3840px, cắt 4:3, nén WebP, sinh manifest
npm i --no-save @imgly/background-removal-node@1.4.5      # mô hình tách nền (~700 MB, chỉ cần khi build ảnh)
node scripts/animals/masks.mjs                             # tách con vật khỏi nền
node scripts/animals/shapes.mjs                            # đường viền + ảnh cắt sát con vật
```

**Tangram.** Gồm 24 hình bóng chia 3 bậc:
- Nhập môn: hiện sẵn đường chia mảnh.
- Thành thạo: chỉ còn đường viền.
- Bậc thầy: chỉ còn hình bóng.

Bài được chấm bằng cách so độ phủ của các mảnh trên lưới 45°, nên ghép theo cách nào cũng được, miễn kín hình. Mọi hình đều đã được bộ giải tự động kiểm chứng là giải được (`src/tangram/geometry.ts`).

## Apple Pencil và cảm ứng

| Thao tác | Bút | Ngón tay |
| --- | --- | --- |
| Cầm, kéo mảnh | Chính xác từng điểm; nhấn mạnh thì mảnh nhấc cao hơn | Có |
| Đưa bút lơ lửng (iPad Pro M2+) | Mảnh dưới đầu bút sáng lên | — |
| Xoay | Chạm mảnh (jigsaw 90°, tangram 45°), kéo núm vàng để xoay tự do | Vặn hai ngón khi đang giữ mảnh |
| Lật (tangram) | Chạm đúp hoặc nút **Lật** | Có |
| Phóng to, kéo bàn chơi | — | Hai ngón |

Khi bút đang chạm màn hình, mọi chạm của lòng bàn tay bị bỏ qua.

## Kỹ thuật

- Vite + TypeScript, Canvas 2D, không dùng framework. Âm thanh tạo bằng Web Audio, không cần file. Nhạc khi hoàn thành là tiếng đàn tranh (Karplus–Strong) trên thang ngũ cung.
- Tiến độ và cài đặt lưu trong `localStorage`. Service worker (vite-plugin-pwa) cache toàn bộ app để chơi offline.

```bash
npm install
npm run dev      # http://localhost:5173 (thêm --host để mở từ iPad cùng mạng)
npm test         # vitest: cắt mảnh, hút mảnh, 24 hình tangram đều giải được
npm run build    # bản production trong dist/
```
