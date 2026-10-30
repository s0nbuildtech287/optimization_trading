# Kế hoạch tối ưu Optimization Filters và Cluster Radius ở quy mô lớn

## 1. Bối cảnh

Tab **All Optimize Results** đang lưu số lượng kết quả rất lớn trong `mt5_optimize_results`. Một session thực tế có thể chứa khoảng 21 triệu bộ tham số.

Luồng hiện tại:

1. PostgreSQL lọc candidate theo session và các metric.
2. Khi có `Cluster Radius`, backend lấy toàn bộ candidate phù hợp lên Node.js.
3. Node.js thực hiện clustering trên trường `summary_op.inputs`.
4. Backend chặn nếu phạm vi vượt `MAX_SYNC_CLUSTER_ROWS = 100000` để tránh đầy heap.

Giới hạn này bảo vệ Node.js nhưng khiến Cluster Radius gần như không sử dụng được với session lớn. Ngoài ra frontend hiện có thể giữ dòng chính của lần lọc cũ khi request mới thất bại, trong khi phần xổ xuống lại tải theo bộ lọc mới. Điều đó tạo ra giao diện sai lệch giống như có `Top N + 1` kết quả.

## 2. Mục tiêu

- Hỗ trợ session hàng chục triệu kết quả mà không tải toàn bộ dữ liệu lên Node.js.
- Hỗ trợ linh hoạt:
  - `Top N Results`: từ 1 đến 50.
  - `Cluster Radius`: từ 0% đến 50%.
  - Các filter Profit, Recovery Factor, Trades, Profit Factor, Equity DD, Sharpe Ratio và các filter hiện có.
- Cải thiện cả hai execution path: filter SQL thông thường khi Radius = 0 và filter kết hợp clustering khi Radius > 0.
- Dòng chính của mỗi strategy luôn là candidate tốt nhất trong tập cluster đã chọn.
- Danh sách xổ xuống và dòng chính dùng cùng một snapshot kết quả.
- Không hiển thị dữ liệu cũ nếu request filter mới thất bại.
- Session đã hoàn thành phải tận dụng cache lâu dài.
- Session đang tiếp tục nhận kết quả phải tự vô hiệu cache đúng lúc bằng `result_version`.
- Không ảnh hưởng các luồng ingest Open Price, OTM, Every Tick, Watchlist hoặc MT5 Worker.

## 3. Không làm trong phạm vi này

- Không thay đổi công thức metric.
- Không thay đổi định nghĩa khoảng cách parameter hiện tại nếu chưa có yêu cầu nghiệp vụ mới.
- Không gom dữ liệu giữa các session. Mọi truy vấn vẫn bắt buộc có `session_id`.
- Không đưa Redis hoặc tạo bảng cache mới trong giai đoạn đầu.
- Không tăng heap Node để che vấn đề thuật toán.
- Không nâng giới hạn 100.000 thành một giới hạn lớn hơn rồi tiếp tục tải toàn bộ dữ liệu.

## 3.1. Quy mô thiết kế

Con số 21 triệu là baseline kiểm thử từ session thực tế hiện có, không phải giới hạn tối đa của thiết kế.

Thuật toán mới không phụ thuộc tuyến tính vào tổng số row toàn session trong bộ nhớ Node.js. Chi phí chính phụ thuộc vào:

- Số strategy trên trang hiện tại.
- Số candidate cần scan trong từng strategy trước khi tìm đủ Top N cluster leader.
- Độ chọn lọc của metric filters.
- Chất lượng index và query plan PostgreSQL.

Các mức quy mô dự kiến:

- Đến khoảng 25 triệu row/session: phải đạt đầy đủ tiêu chí nghiệm thu bằng kiến trúc batch + cache.
- Từ 25 đến 100 triệu row/session: vẫn dùng cùng thuật toán; cần đo lại query plan, batch size, cache hit và dung lượng index.
- Trên 100 triệu row/session hoặc tổng bảng tăng đến hàng trăm triệu row: cân nhắc partitioning, read replica cho truy vấn đọc, persistent/distributed cache và summary bất đồng bộ. Những biện pháp này là nâng cấp hạ tầng, không làm thay đổi contract Top N/Cluster Radius.

Không cam kết một ngưỡng row tuyệt đối mà không đo phần cứng và phân bố dữ liệu. Cam kết kiến trúc là không tải toàn session lên Node, giữ bộ nhớ bounded và có đường nâng cấp rõ khi dữ liệu tăng.

## 4. Nguyên tắc kiến trúc

Tách xử lý thành hai tầng:

```text
PostgreSQL candidate retrieval
  - session ownership
  - metric filters
  - strategy
  - ORDER BY result_value DESC, id DESC
            |
            v
Bounded clustering in Node.js
  - đọc theo batch
  - chỉ giữ tối đa Top N leaders
  - dừng ngay khi đủ Top N
            |
            v
Versioned cache
  - session_id + result_version + normalized filters
            |
            v
Frontend parent row + expandable rows dùng cùng kết quả
```

PostgreSQL chịu trách nhiệm lọc những trường đã có cột số. Node.js chỉ xử lý khoảng cách giữa các parameter input mà SQL khó tối ưu trực tiếp.

## 5. Quy tắc nghiệp vụ cần chốt

### 5.1. Top N

- Giá trị hợp lệ: `1–50`.
- `Top N` là số cluster leader tối đa trên mỗi strategy.
- Nếu chỉ tìm được 17 cluster khác biệt thì trả 17, không tạo giả đủ 50.
- Badge hiển thị số leader thực tế trả về, không hiển thị tổng raw candidate trước clustering.

### 5.2. Cluster Radius

- Giá trị hợp lệ: `0–50%`.
- `0%` giữ hành vi không clustering.
- Khoảng cách tiếp tục dùng hàm canonical duy nhất, hiện tại là mức chênh lệch tương đối lớn nhất giữa các input số.
- Candidate thiếu `inputs` không được dùng làm cluster leader; cần ghi nhận số lượng bị bỏ qua trong telemetry.

### 5.3. Thứ tự

- Candidate được đọc theo:

```sql
ORDER BY result_value DESC NULLS LAST, id DESC
```

- Greedy clustering xử lý đúng thứ tự này.
- Leader đầu tiên là Best Pass của strategy.
- Khi đủ Top N leader, có thể dừng vì các candidate phía sau không thể có Result cao hơn.

## 6. Thuật toán clustering mới

### 6.1. Phân trang strategy trước

Ở chế độ `Group by Strategy`, backend chỉ lấy danh sách strategy của trang hiện tại sau khi áp dụng metric filters.

Ví dụ trang có 10 strategy thì chỉ cluster 10 strategy đó, không cluster toàn session để dựng một trang.

Phân trang strategy phải dùng keyset/cursor theo `strategy_id`, tránh offset sâu khi có nhiều strategy.

### 6.2. Đọc candidate theo batch thích nghi

Với từng strategy:

1. Khởi tạo `leaders = []`.
2. Đọc batch đầu tiên 2.000 candidate đã được DB lọc và sắp xếp.
3. Với từng candidate:
   - Bỏ qua nếu không có parameter input hợp lệ.
   - So với tối đa `leaders.length` leader.
   - Nếu không nằm trong radius của leader nào thì thêm vào `leaders`.
4. Dừng ngay khi `leaders.length === topN`.
5. Nếu chưa đủ và batch còn đầy:
   - Batch tiếp theo tăng lên 5.000.
   - Sau đó có thể tăng lên tối đa 10.000.
6. Nếu hết candidate thì trả số leader thực tế.

Pseudo-code:

```js
async function findClusterLeaders({ strategyId, filters, radius, topN }) {
  const leaders = [];
  let cursor = null;
  let batchSize = 2000;

  while (leaders.length < topN) {
    const rows = await loadCandidateBatch({
      strategyId,
      filters,
      cursor,
      limit: batchSize
    });

    if (!rows.length) break;

    for (const row of rows) {
      if (!hasValidInputs(row)) continue;
      const belongsToExistingCluster = leaders.some(
        (leader) => parameterDistance(leader.inputs, row.inputs) <= radius
      );
      if (!belongsToExistingCluster) leaders.push(row);
      if (leaders.length >= topN) break;
    }

    if (leaders.length >= topN || rows.length < batchSize) break;
    cursor = cursorFrom(rows.at(-1));
    batchSize = Math.min(batchSize < 5000 ? 5000 : 10000, 10000);
  }

  return leaders;
}
```

### 6.3. Keyset trong từng strategy

Không dùng `OFFSET` khi đọc candidate sâu. Cursor gồm:

```text
result_value + id
```

Điều kiện batch kế tiếp phải tương thích với thứ tự sort, xử lý chính xác cả trường hợp cùng `result_value`.

### 6.4. Giới hạn concurrency

- Chỉ cluster đồng thời 2–3 strategy.
- Không dùng `Promise.all()` không giới hạn cho toàn bộ trang.
- Dùng worker pool nhỏ hoặc helper `mapWithConcurrency`.
- Request bị client hủy phải ngừng đọc batch tiếp theo sớm nhất có thể.

### 6.5. Execution path không dùng Cluster Radius

Khi `Cluster Radius = 0`, backend không chạy thuật toán batch clustering trong Node.js. PostgreSQL tiếp tục xử lý toàn bộ metric filters, ranking và Top N.

Nhánh này vẫn phải nhận các cải thiện chung:

- Dùng cùng canonical filter payload và versioned cache.
- Dùng keyset pagination thay vì offset sâu.
- Chỉ lấy cột cần thiết cho trang hiện tại rồi hydrate detail khi cần.
- Không để exact count/summary nặng chặn việc hiển thị trang kết quả đầu tiên.
- Dùng in-flight request deduplication khi nhiều component/request gọi cùng bộ lọc.
- Chạy `EXPLAIN (ANALYZE, BUFFERS)` cho các tổ hợp filter phổ biến để tối ưu index/query plan dựa trên bằng chứng.
- Parent row và expanded rows vẫn phải dùng cùng applied filter snapshot.

Vì không cần đọc `inputs` và tính khoảng cách, nhánh Radius = 0 phải nhanh hơn đáng kể so với clustering. Tuy nhiên với hàng chục hoặc hàng trăm triệu row, cache, keyset và count/summary tách biệt vẫn cần thiết.

## 7. Cache kết quả clustering

### 7.1. Cache key

Cache key phải bao gồm đầy đủ:

```text
actor/user scope
session_id
session.result_version
view mode
strategy page cursor/page identity
normalized table filters
normalized metric filters
top_n
cluster_radius
sort version / algorithm version
```

Ví dụ logic:

```text
cluster:v1:user=2:session=15:version=1248:filterHash=abc123:page=cursorXYZ
```

`result_version` hiện đã tăng khi kết quả optimization của chính session thay đổi. Vì vậy:

- Session A có job mới: cache Session A tự miss.
- Session B không thay đổi: cache Session B vẫn dùng được.
- Session hoàn thành: cùng version nên cache có thể được tái sử dụng lâu dài.

### 7.2. Dữ liệu cache

Cache lưu:

- Danh sách strategy trên trang.
- Danh sách leader ID theo từng strategy.
- Best Pass ID.
- Số leader thực tế.
- Cursor trang kế tiếp.
- Telemetry cơ bản: scanned rows, batch count, processing time.

Chỉ cần lưu ID và metadata nhỏ. Khi trả API có thể hydrate metric theo danh sách ID bằng một query `WHERE id = ANY(...)`.

### 7.3. Cơ chế cache

Giai đoạn đầu dùng backend in-memory LRU:

- Có giới hạn số entry và tổng kích thước ước tính.
- TTL dùng để dọn RAM, không dùng làm tiêu chuẩn đúng/sai dữ liệu.
- Có thể đặt TTL 30–60 phút nhưng entry session hoàn thành sẽ được tính lại chỉ khi đã bị LRU loại bỏ hoặc backend restart.
- Correctness dựa trên `result_version`, không dựa trên TTL.
- Có in-flight deduplication: nhiều request cùng cache key dùng chung một Promise tính toán.
- Không cache lỗi hoặc kết quả bị abort.

Nếu sau này chạy nhiều backend instance và cần cache dùng chung, nâng cấp sang Redis. Việc không có Redis chỉ ảnh hưởng hiệu năng cache hit giữa các instance, không ảnh hưởng tính đúng.

### 7.4. My Default Filter

My Default Filter vẫn lưu cấu hình như hiện tại. Khi user áp dụng lại:

1. Chuẩn hóa filter thành cùng một canonical payload.
2. Sinh cùng `filterHash`.
3. Nếu session version chưa đổi, cache hit và trả ngay.
4. Nếu session version đổi, tính lại rồi ghi cache mới.

Không lưu trực tiếp một kết quả clustering cố định vào preference vì kết quả phụ thuộc session version.

## 8. API và service

### 8.1. Giữ tương thích API hiện tại

Ưu tiên giữ `GET /results` và query parameters hiện tại để frontend không phải thay đổi giao thức lớn.

Backend chọn execution path:

- Không có Cluster Radius: dùng SQL path đã tối ưu, keyset pagination và versioned cache; không chạy clustering Node.js.
- Có Cluster Radius và Group by Strategy: dùng paged strategy clustering mới.
- Có Cluster Radius và Flat Mode: xác định rõ semantics; ưu tiên phân trang theo strategy rồi flatten leader, không cluster toàn session trong một mảng.

### 8.2. Response cần nhất quán

Mỗi parent row nên có:

```json
{
  "id": 2933,
  "strategy_id": "109US30H4OS",
  "total_passes": 5,
  "cluster_result_ids": [2933, 11784, 11649, 11592, 2537],
  "cluster_cache_token": "opaque-token"
}
```

Không nhất thiết phải gửi cả năm row đầy đủ ở parent response nếu payload lớn. Có thể gửi IDs/token để endpoint xổ dòng hydrate đúng snapshot.

### 8.3. Xổ dòng

Khi user xổ strategy:

- Ưu tiên dùng `cluster_cache_token` hoặc danh sách ID đã tính.
- Không chạy lại clustering với trạng thái filter độc lập.
- Nếu cache token hết hạn nhưng `result_version` vẫn giống nhau, có thể tính lại cùng canonical filter.
- Nếu version đã đổi, trả mã trạng thái rõ để frontend reload parent page, tránh parent/child khác snapshot.

## 9. Frontend: áp dụng filter nguyên tử

Hiện frontend có `filterRules` và `appliedFilterRules`. Cần dùng đúng vai trò:

- `filterRules`: draft user đang chỉnh.
- `appliedFilterRules`: bộ lọc đã được server chấp nhận và đang tương ứng với bảng hiện tại.

Quy trình Apply:

1. Validate draft.
2. Gửi request bằng normalized draft nhưng chưa cập nhật `appliedFilterRules`.
3. Trong khi chạy:
   - Disable Apply lặp.
   - Disable expand hoặc giữ expand thuộc snapshot cũ.
4. Khi thành công:
   - Atomically thay `results`.
   - Cập nhật `appliedFilterRules`.
   - Cập nhật summary/count.
   - Xóa expanded rows cũ.
5. Khi thất bại:
   - Giữ nguyên bảng cũ và `appliedFilterRules` cũ.
   - Hiện rõ: bộ lọc mới chưa được áp dụng.
   - Không cho phần xổ dòng sử dụng draft filter vừa thất bại.

Nhờ vậy không còn trường hợp parent cũ + child mới.

### 9.1. Parent và child

- Parent là leader đầu tiên.
- Expanded panel hiển thị toàn bộ leader list gồm parent candidate.
- Giao diện có thể nhìn thấy một dòng summary bên ngoài và Top N dòng chi tiết bên trong, nhưng phải hiểu đó là Top N unique candidate; parent không phải candidate thứ N+1.
- Tiêu đề panel ghi rõ `N unique clustered passes`.

### 9.2. Cache frontend tùy chọn

Dùng `sessionStorage` để giữ response gần nhất theo cache key rút gọn:

- Hiển thị nhanh khi quay lại tab.
- Luôn gọi nhẹ `/results/state` để so `resultVersion`.
- Version giống: giữ dữ liệu.
- Version khác: đánh dấu có dữ liệu mới và reload theo cơ chế hiện tại.

Frontend cache chỉ cải thiện cảm nhận; backend cache mới là nguồn tối ưu chính.

## 10. Database và index

Đã có index nền tảng:

```text
(session_id, strategy_id, result_value DESC, id DESC)
```

Index này phù hợp cho việc đọc candidate theo strategy và keyset.

Trước khi thêm index mới phải chạy `EXPLAIN (ANALYZE, BUFFERS)` trên DB test với các filter thực tế. Không tạo một composite index khổng lồ chứa mọi metric vì:

- User có thể phối hợp filter linh hoạt.
- Index sẽ rất lớn và làm chậm ingest.
- PostgreSQL có thể không dùng đúng index nếu cột đầu không phù hợp điều kiện.

Chỉ bổ sung index sau khi có bằng chứng query plan. Mọi `CREATE INDEX` lớn trên production phải dùng kế hoạch migration an toàn, ưu tiên `CONCURRENTLY` chạy thủ công ngoài transaction nếu cần.

## 11. Count và summary

Không được cluster toàn session chỉ để tính tổng trước khi trả trang đầu.

Tách rõ:

- `raw_matching_candidates`: PostgreSQL có thể đếm theo filter, nhưng query count chính xác trên hàng chục triệu dòng vẫn có thể nặng.
- `matching_strategies`: `COUNT(DISTINCT strategy_id)` theo metric filter.
- `clustered_passes`: chỉ chắc chắn cho các strategy đã được cluster.

UI không nên đợi exact clustered count toàn session mới hiển thị trang. Có thể:

- Hiển thị số strategy matching.
- Hiển thị số cluster leader của từng strategy trên trang.
- Tính summary nặng riêng hoặc cache riêng.

## 12. Trường hợp cực đoan

Trường hợp khó nhất:

- Filter rất rộng.
- Radius lớn.
- Top N = 50.
- Candidate của một strategy rất giống nhau.

Backend có thể phải đọc hết candidate của strategy mới kết luận chỉ có ít hơn 50 cluster. Thuật toán mới vẫn đảm bảo:

- RAM bị chặn theo batch.
- Không tải hàng triệu object cùng lúc.
- Không chạy quá nhiều strategy đồng thời.
- Có log tiến độ và thời gian.

Nếu thực tế một strategy vẫn cần thời gian vượt ngưỡng HTTP chấp nhận được, giai đoạn sau chuyển riêng clustering đó thành background task có progress. Không trả kết quả thiếu mà giả vờ đã hoàn thành.

## 13. Observability

Mỗi request clustering cần structured log:

```text
session_id
result_version
filter_hash
page/cursor
strategy_count
top_n
radius
cache_hit/cache_miss
rows_scanned theo strategy
batch_count theo strategy
leaders_found
db_ms
cluster_ms
wall_ms
heap_before_mb
heap_after_mb
aborted/error
```

Không log toàn bộ parameter inputs hoặc dữ liệu nhạy cảm.

Các metric cần theo dõi:

- P50/P95/P99 response time.
- Cache hit ratio.
- Số row scan trung bình để tìm đủ Top N.
- Số strategy phải scan hết nhưng không đủ Top N.
- PostgreSQL connection usage.
- Node heap và event-loop delay.

## 14. Kế hoạch triển khai theo phase

### Phase 1 — Correctness UI

- Áp dụng filter nguyên tử.
- Không commit draft filter khi API lỗi.
- Không trộn parent cũ và child mới.
- Bổ sung test regression cho lỗi Top N nhìn thành N+1.

Kết quả: giao diện đúng, nhưng giới hạn clustering cũ vẫn còn trong thời gian ngắn.

### Phase 2 — Backend batch clustering

- Tách helper canonical `parameterDistance` và greedy leader selection.
- Tạo DAO đọc candidate theo strategy bằng keyset batch.
- Tạo service lấy strategy page rồi cluster với bounded concurrency.
- Áp giới hạn Top N/Radius ở backend và frontend.
- Giữ path không clustering như hiện tại.

Kết quả: bỏ phụ thuộc giới hạn 100.000 cho Group by Strategy.

### Phase 3 — Versioned LRU cache

- Canonicalize filter payload.
- Hash cache key.
- LRU cache có giới hạn.
- In-flight request deduplication.
- Parent/expanded rows dùng chung cached IDs/token.

Kết quả: My Default Filter và filter lặp lại trả gần như tức thì khi session không đổi.

### Phase 4 — Performance validation

- Chạy trên bản sao dữ liệu session khoảng 21 triệu dòng.
- Thu `EXPLAIN ANALYZE` và telemetry.
- Điều chỉnh batch size, concurrency, cache size dựa trên số đo.
- Chỉ thêm index khi query plan chứng minh cần thiết.

### Phase 5 — Rollout an toàn

- Đặt feature flag cho clustering path mới.
- Chạy shadow comparison trên một số request: thuật toán cũ với phạm vi nhỏ so với thuật toán mới.
- So sánh chính xác IDs và thứ tự leader.
- Bật dần cho admin/tester rồi toàn bộ user.
- Giữ khả năng quay lại path cũ cho session nhỏ trong thời gian nghiệm thu.

## 15. Verification plan

### 15.1. Unit tests

- Khoảng cách parameter đúng với công thức hiện tại.
- Candidate trong radius bị bỏ qua.
- Candidate ngoài radius trở thành leader mới.
- Dừng đúng khi đủ Top N.
- Trả ít hơn Top N khi hết dữ liệu.
- Candidate thiếu/không hợp lệ inputs được xử lý ổn định.
- Cursor không bỏ sót hoặc lặp row khi cùng `result_value`.
- Canonical filter khác thứ tự key vẫn tạo cùng cache key.

### 15.2. Integration tests

- Parent ID bằng leader đầu tiên.
- Expanded IDs đúng bằng cached leader IDs.
- Badge bằng số unique leader.
- Session A tăng version chỉ làm cache A miss.
- Session B giữ nguyên version vẫn cache hit.
- Request giống nhau đồng thời chỉ chạy một computation.
- Abort request không ghi cache kết quả dở dang.

### 15.3. E2E frontend

- Apply thành công cập nhật đồng thời parent, badge và expanded rows.
- Apply thất bại giữ nguyên snapshot cũ và thông báo filter mới chưa áp dụng.
- Không xuất hiện parent không đạt filter mới.
- Top N = 5 không tạo sáu unique candidate.
- Quay lại My Default Filter nhận cache hit khi session không đổi.

### 15.4. Load tests

Các cấu hình tối thiểu:

1. Top 5, Radius 0%, filter vừa và filter rộng.
2. Top 50, Radius 0%, filter rộng và lặp lại để xác nhận cache hit.
3. Top 5, Radius 15%, filter vừa.
4. Top 50, Radius 15%, filter rộng.
5. Top 50, Radius 50%, filter rộng.
6. Nhiều user lọc các session khác nhau đồng thời.
7. Worker tiếp tục ingest vào một session trong khi user filter session khác.
8. Dataset tổng hợp 50 triệu row để xác nhận thời gian tăng trưởng và tính ổn định của heap.
9. Dataset tổng hợp 100 triệu row hoặc replay query plan tương đương để xác định thời điểm cần partition/read replica.

Tiêu chí:

- Không OOM Node.
- Không chiếm hết PostgreSQL pool.
- Không giữ hàng trăm nghìn row trong heap.
- Session khác không bị cache invalidation sai.
- Kết quả deterministic với cùng session version và filter.

## 16. Tiêu chí nghiệm thu

- Session khoảng 21 triệu kết quả sử dụng được Cluster Radius ở Group by Strategy.
- Không còn lỗi `MT5_CLUSTER_SCOPE_TOO_LARGE` cho luồng paged clustering mới.
- Top N tối đa 50 và Radius tối đa 50% hoạt động đúng.
- Parent, badge và expanded rows nhất quán tuyệt đối.
- Filter thất bại không hiển thị dữ liệu trộn.
- Cache hit trả đúng snapshot của session version.
- Có số đo chứng minh Node heap được giữ ổn định và DB pool không nghẽn.
- Không thay đổi logic ingest, OTM, rerun, Every Tick, Watchlist và quyền sở hữu session.

## 17. Kết luận

Không nên giải quyết bằng cách tăng giới hạn 100.000. Hướng đúng là:

1. PostgreSQL lọc và sắp xếp.
2. Backend cluster theo từng strategy bằng keyset batch và dừng sớm.
3. Cache theo `session_id + result_version + canonical filter`.
4. Frontend chỉ commit filter khi toàn bộ response hợp lệ.

Thiết kế này xử lý đúng dữ liệu hiện tại, kiểm soát RAM/DB và tiếp tục mở rộng khi số lượng optimization result tăng thêm.
