WORK LOG — 開発方針・設計記録

Current version: v1.1.0 — Grading payroll and rate locks
Release build: 1101 / Database schema version: 2
Target: v1.0 — Work registration, record review, and backup

【1. 目的・基本原則】
個人の勤務・給与を長期管理するローカルファーストのアプリ。
新しい機能や大きな仕様変更によって、過去の勤務記録・給与額を壊さない。
既存の緑・ベージュの画面を維持し、データベースと画面の役割を分離する。
実装済み・計画・検証済みを区別し、変更のたびに本書を更新する。
初回の実用公開は v1.0 を目標とし、勤務登録、勤務記録確認、バックアップの3機能を優先する。
予定、給与分析、勤務先管理画面、締め日・支払日などは公開後の拡張候補。
以前のv0.4.0公開案は、v1.0を初期実用公開とする方針に更新した。

【2. 起動方法・今回の更新】
1. 現在のソースフォルダを別の場所にコピーして保管する。
2. ZIPを展開し、既存のkinmu-app/の同名ファイルを上書きする。
   sqlite/・fontawesome/が既にあれば、そのフォルダは残す。
   旧app.jsやstyle.cssは最新版のHTMLから参照しない。過去版として別に保管してよい。
   個人の勤務データ、SQLiteバックアップはGitHubにアップロードしない。
3. VSCodeでkinmu-app/を開き、ターミナルで py -m http.server 8000 を実行する。
4. Chromeで http://localhost:8000/ を開く。file:// で直接HTMLを開かない。
5. ホームのSQLiteステータスが「SQLite保存可能」になったら、勤務日・勤務先・勤務内容を入力する。
   入力がそろうと登録ボタンが濃い緑で有効になる。
6. 金曜日2026-11-13の守口スイミング A-3・A-4をテスト登録する。
   基本給2,880円、交通費380円、合計3,260円。
   同日にM-1を追加すると基本給4,680円、交通費380円、合計5,060円。
   既存記録がある場合はその金額に追加されるため、テスト用の別日を選ぶ。
7. 勤務実績ページで確認し、再読み込み後にも残るか確認する。
   バックアップページでSQLiteファイルを出力する。

SQLiteライブラリ：既存のsqlite/sql-wasm.js・sql-wasm.wasmを同じ組で優先する。
なければ旧版で使用していたsql.js 1.13.0のjsDelivr CDN、その後cdnjs CDNを試す。
ローカルのライブラリ2ファイルは今回のZIPには同梱していない。
Windowsでローカルへ取得する場合、同梱の setup-sqlite.cmd を実行する。
両方が既に存在する場合は上書きしない。片方だけの場合は同じバージョンの組を取得する。
初回はインターネット接続が必要なことがある。完全なオフライン動作は要実機確認。
参照: https://sql.js.org/ / https://cdn.jsdelivr.net/npm/sql.js@1.13.0/dist/

登録できない場合：
・SQLiteの状態表示と登録ボタン下の説明を確認する。
・「SQLite保存可能」でも勤務日・勤務先・勤務内容が未入力なら、意図的にボタンは無効。
・SQLite準備失敗の場合は、表示された全文を確認する。ブラウザの保存データを削除しない。
・古い画面が表示される場合、ChromeのCtrl+Shift+Rで更新する。
  必要なら開発者ツール Application → Service Workers → Unregister で旧SWのみ解除し、再読み込みする。
  Clear site data / IndexedDB / Local Storage の削除は行わない。
・GitHub Pagesに置く場合は全変更ファイルのデプロイ完了後に再確認する。

【3. フォルダ階層】
kinmu-app/
├── index.html              ← ホーム・勤務登録
├── home.css                ← 共通デザインとホーム
├── home.js                 ← 入力・給与計算・登録
├── work-records.html       ← 勤務記録確認
├── records.js              ← 一覧・検索・交通費/備考修正・削除
├── backup.html             ← バックアップ・復元
├── backup.js               ← SQLiteファイル出力・復元
├── pages.css               ← サブページ固有のデザイン
├── startup.js              ← 各ページからService Workerを登録
├── service-worker.js       ← バージョン付きキャッシュ・オフライン対応
├── manifest.webmanifest    ← PWA設定
├── README.txt
├── setup-sqlite.cmd        ← 必要時のみWindowsでライブラリ取得
├── database/
│   ├── database.js         ← SQLite初期化・登録・検索・移行・復元
│   ├── migrations.js       ← スキーマ定義・DBバージョン
│   └── storage.js          ← IndexedDB読み書き・競合防止
├── sqlite/                 ← 既存フォルダを維持、必要時に取得
│   ├── sql-wasm.js
│   └── sql-wasm.wasm
└── fontawesome/            ← 既存のローカル資産がある場合は保持
    ├── css/all.min.css
    └── webfonts/...
現在のHTMLはFont AwesomeをCDNから取得する。SQLiteとは独立している。
将来、勤務先管理や給与ルールをworkplaces.js、payRules.js等に分割する余地を残す。

【4. データベース設計（schema v1 基礎構造・v2の追加項目は第10節）】
workplaces: 不変のID、名前、表示順sort_order、有効フラグ、初期給与設定。
work_records: 1日×1勤務先で1件。勤務日、勤務先ID、当時の名称、当日の交通費、備考、作成・更新日時。
  UNIQUE(work_date, workplace_id) で親記録の重複を防止。
work_record_items: 親記録ID、給与区分（lesson/hourly/direct）、コマコード、クラス、開始・終了、勤務分数、単価、倍率、確定金額。
  UNIQUE(work_record_id, lesson_code) で同じコマの二重登録を防止。
record_history: 編集・削除・追加前のスナップショット。旧版から移行した行の原データも保持。
  記録IDは削除後に再利用しないよう、履歴を含む最大IDから採番する。

基本給は勤務明細の確定金額の合計、総支給額は基本給＋交通費。
同日の追加勤務は既存親記録に追加する（A方式）。交通費は原則として最初の金額を維持。
異なる時給・給与形態の明細を混在させる余地を確保。
登録済みコマは除外。時間重複・同額の直接入力は確認を表示する。
休憩・勤務予定・給与支払・給与ルール適用期間・交通費明細は将来の拡張候補。

初期勤務先（順序はsort_orderで管理）:
守口スイミング、ロボ団、東進・採点、東進・品質管理、Cinet、想彩、エイジェックマーケティング、社会経済実験、Uber Eats、Rocket Now。
その他は新規勤務先入力用。勤務先IDと表示順は独立する。
守口は70分ジュニア1,440円、成人1,800円、片道190円。
ロボ団は片道500円、時給1,300円は従来の仮設定。正しい時給を確認して入力する。
その他の勤務先の時給は手入力、直接入力はチェックで切り替える。
勤務先管理画面での追加・並べ替え・非表示・給与設定の変更は今後実装する。

【5. データ保護・保存方式】
・SQLite/sql.jsとIndexedDBを使用。SQLiteのファイルバイト列を保存する。
・IndexedDB: database=worklog, store=files, key=main、revisionで競合を検出。
  v1.1.0ではschema v2へ移行するが、この保存先は変更しない。
・PRAGMA foreign_keys=ON、NOT NULL、CHECK、UNIQUE、パラメータ付きSQLを利用。
・SQLトランザクションとIndexedDBトランザクションの両方を確認する。
  IndexedDBへの保存完了後のみ成功表示。失敗時はメモリDBを直前の状態へ戻す。
・別タブが先に更新した場合は古いデータを上書きせず、再読み込みを促す。
・過去の給与は登録時点の単価・確定金額を保持し、現在の給与設定で再計算しない。
・勤務先名を変更しても過去の名称スナップショットを保持する。
・DB構造はPRAGMA user_versionで管理。未知の新しいDBは古いアプリで書き換えない。
・復元時は別DBとして構造・integrity_check・foreign_key_check・主要項目を検証する。
  復元前のmainを同一IndexedDBトランザクションでpreviousに退避する（1世代）。
  previousのファイル出力も可能。端末外のバックアップの代替にはしない。
・ブラウザの保存は容量制限、データ消去、端末故障等のリスクがある。外部バックアップ必須。
・GitHub Pagesにはアプリのコードだけを置く。勤務データを送信するサーバーはない。
・保存先変更はstorage.jsの境界で吸収する。端末・URL変更は旧環境から出力して新環境で復元。
  クラウド同期を導入する場合は認証・同期・競合解決を別途設計する。

旧試作版v0.1の移行（今回追加）:
・同一オリジンに既存IndexedDBがない場合、localStorageのkinmu_sqlite_v01を検査する。
・旧work_records（workplace、salary、direct_amount等）を認識し、schema v1へ変換後、v2へ移行する。
・direct_amountは金額そのものではなく0/1のフラグとして読み、salaryの確定額をそのまま保存する。
・同日・同勤務先の旧記録は親記録1件の複数明細にする。元の給与は合算し、重複と決めつけて削除しない。
・旧版は交通費未対応のため交通費0円。旧勤務先名「東進」等は勝手に採点・品質管理に割り当てない。
・旧localStorageは削除しない。移行済みIndexedDBがある場合は再移行しない。
・旧版の.sqliteファイルもバックアップページで検証・変換して復元可能。
・不明な形式・破損・不正な項目は拒否し、空のDBで上書きしない。
・既存IndexedDBがある状態で別の旧DBを統合する機能は未実装。復元は置き換えであり、マージではない。

【6. バージョンアップ毎の作業】
1. アプリのバックアップ機能でSQLiteファイルを端末外へ出力。
2. コードをテストし、READMEの実装状況と英語の変更履歴を更新。
3. アプリのバージョン変更時は全ページのフッターを変更する。
4. 配信ファイル変更時はservice-worker.jsのCACHE_NAME、キャッシュ対象、HTMLの?v=値を一致させて更新。
   例: CACHE_NAME = 'worklog-v030-recovery-3-' + scope; HTML asset version = 0303。
   Service Worker更新のためにIndexedDBやlocalStorageを消さない。
5. DB構造変更時のみPRAGMA user_versionを更新し、順次マイグレーションと整合性確認を追加。
6. GitHub: Code → Add file → Upload files。変更をまとめて同じ階層へアップロードする。
7. 英語のコミット名（可能なら50文字未満）とExtended descriptionを記載。
8. GitHub Pagesのデプロイ後、PC/iPhoneの登録・再読み込み・更新前データ・バックアップを確認。

【7. 現時点の実装状況・検証】
実装済み：勤務登録（コマ・時給・直接入力）、同日追加、重複確認、記録一覧・検索、交通費・備考の修正、記録削除、SQLiteバックアップ・復元、復元前バックアップ、旧版移行、IndexedDB保存・世代比較。
未実装：勤務日・個別明細の全面編集、勤務先管理画面、休憩・日付またぎ・深夜割増・税金、勤務予定・給与支払管理。
検証済み：JavaScript構文、native SQLite 3.49.1を用いたDBロジックのテスト、旧DB変換、同日追加、重複、バックアップ復元、保存失敗・世代競合時のロールバック（保存層はテスト用）、ChromiumのDOMと入力操作（DBインターフェースはテスト用）。
未検証：実際のsql.js/WASM＋IndexedDBを組み合わせたブラウザ統合テスト、実際のService Workerのオンライン/オフライン遷移、iPhone Safari/PWA、現行GitHub Pagesへのデプロイ。
外部ライブラリをこの環境で取得できなかったため、実ライブラリ・実機の検証はユーザー環境で行う。
公開前に勤務登録→再読み込み→記録確認→バックアップ→復元、および旧データ移行を確認する。

【8. Version history (English)】
v0.1 — Add work registration UI.
v0.2 — Add work records UI.
v0.2.1 — Add work registration and records UI.
  - Add lesson selection and weekday restrictions.
  - Calculate hourly and lesson-based pay with transportation fees.
  - Improve navigation and cache handling.
v0.2.2 — Refactor WORK LOG codebase. (Proposed version label)
  - Separate calculations, rendering, and event handlers.
  - Preserve existing UI and behavior.
v0.3.0 — Define database architecture and release scope.
  - Document data integrity, migration, storage, and duplicate-handling policies.
  - Restore Toshin grading as a separate workplace.
v0.3.0 — Add SQLite and core features.
  - Add the database schema, IndexedDB persistence, record list, and backup pages.
  - Add daily record aggregation, duplicate protection, and record history.
v0.3.0 — Fix SQLite startup and unify page navigation.
  - Prefer local SQLite assets with CDN fallback.
  - Share the home header, navigation, and footer across pages.
v0.3.0 (build 0303) — Fix SQLite startup and migrate legacy data.
  - Migrate the known v0.1 localStorage database without deleting the original.
  - Preserve historical amounts and workplace names.
  - Load matching SQLite JavaScript/WASM assets with explicit errors and fallbacks.
  - Enable registration only after database readiness and valid input.
  - Prevent stale-tab overwrites and roll back unsuccessful writes.
  - Save a pre-restore backup and validate imported databases.
  - Version static assets and preserve the current WORK LOG design.
  - Keep schema version 1 and the existing IndexedDB storage location.

【9. Planned releases (English)】
v0.3.x — Validate browser persistence and complete core record editing.
v1.0 — Release the initial usable app: registration, records, and backup.
Later — Add workplace management, schedules, payroll analytics, and payment tracking.

Commit message convention:
English, concise, preferably under 50 characters. Extended details in the description.
Suggested commit: v1.1.0 Add grading and rate locks

【10. v1.1.0 update】
 v1.0.0 — First official release (registration, records, backup).
 v1.1.0 — Add grading payroll and rate locks.
- Add grading payroll based on grader rate and total effort.
- Add subject selection and exact decimal calculation.
- Lock configured hourly rates with a per-entry override.
- Set Toshin quality management hourly rate to JPY 1,600.
- Migrate schema v1 to v2 without changing historical amounts or IDs.
- Preserve pre-migration SQLite bytes in a separate backup slot.

採点はSlack通知の合計工数を入力。採点者単価の初期値2000円。工数は小数12桁まで文字列で保持し、整数演算で端数処理前の金額を保存する。現時点の給与額は明細ごとに円単位四捨五入（東進の実際の端数処理は未確認）。同日の累計通知を追加登録しないこと。Excel連携は将来対応。勤務先の基本時給はDBから取得し、今回だけ変更はマスタに反映しない。
更新前にSQLiteバックアップを外部保存。更新後は旧版DBを開くことはできないため、旧版に戻す場合は更新前バックアップを使う。

DB更新前のバックアップは before-schema-v2 に保存し、従来の復元前バックアップとは分離する。workplaces.default_grading_rate、work_record_items.subject / effort / exact_amount を追加。pay_type に piecework を追加。

【11. Records dashboard update (next release v1.2.0)】
- Add year, month, and workplace filters to work records.
- Add monthly and workplace summaries with base pay, transportation and gross pay.
- Add annual totals based on work dates, independent of the selected month.
- Preserve existing record editing, deletion and backup functions.
- Keep database schema v2 and IndexedDB storage unchanged.

初期表示は今月・全勤務先。年・月・勤務先を変更可能。月別集計は選択年と勤務先、勤務先別集計は選択年・月の全勤務先。キーワードは記録一覧のみ。年間総額は勤務日ベースであり、実際の入金日・税務上の収入額ではない。既存の期間開始日・終了日入力は年・月選択に置換。勤務先は安定したIDで集計し、過去の非表示勤務先も記録があれば選択可能。
キャッシュ名 worklog-v0.6.3-（公開パス接尾辞を保持）。アプリの他ページのフッターは変更せず、公開時にバージョンを統一する。
Suggested commit: Add monthly and annual work summaries


【12. Final pre-release UI polish】
- Add a scrolling release announcement to all three pages.
- Fine-tune narrow-screen navigation and date input sizing.
- Respect reduced-motion preferences.
- Preserve existing fonts, database schema, and application logic.
Cache: worklog-v0.6.4- (scope suffix retained).
Suggested commit: Polish release banner and mobile layout
