# Quick TAB

## Overview
ブラウザ上でギター TAB 譜を高速入力するための単一ページエディタ。譜面プレビュー、TAB グリッド、フレットボード入力、モバイル用テンキーを組み合わせ、短い操作で音価付きのノートや休符を配置できることを目的とする。

## Stack
- Framework: Next.js App Router + React + TypeScript
- Rendering: クライアントコンポーネント主体。譜面プレビューは独自 SVG 描画、音のプレビューは Web Audio で生成する
- Storage: 保存先はブラウザ `localStorage`。サーバー保存や同期機構は持たない

## Structure
- `app/page.tsx`: エディタ本体。UI 状態(選択セル、入力モード、tempo 表示等)を保持し、下記 hook 群を統合して JSX を描画する統合レイヤー
- `app/tabModel.ts`: TAB データモデルと編集ルール。イベント衝突判定、sanitize、measure 操作、コピー/ペースト変換、カーソル前進計算、legacy 互換を担う
- `app/components/StaffPreview.tsx`: TAB データから五線譜プレビューを描画する
- `app/components/FretboardInput.tsx`: フレットボード UI とフリック入力を扱う
- `app/components/MobileNumpad.tsx`: モバイル向け数字入力と休符入力を扱う
- `app/hooks/useFlickGesture.ts`: フリック方向から音価と modifier を確定する
- `app/hooks/usePlayback.ts`: Web Audio による発音と step 単位の再生カーソル進行を管理する
- `app/hooks/useTabStorage.ts`: localStorage への読み書きと legacy データ移行を担う
- `app/hooks/useUndoRedo.ts`: undo/redo スタック管理と canUndo/canRedo 状態を担う
- `app/hooks/useKeyboardShortcuts.ts`: キーボードショートカットのイベント登録を担う
- `app/hooks/useNotationLayout.ts`: tabData と選択状態から表示レイアウト(displayUnit、measure ごとの step/slot テーブル、blocked steps、overflow、measure 開始 X 座標)を導出する
- `app/hooks/useTabEditing.ts`: ノート/休符配置、フリック配置、音価変更、削除、Tie の編集ハンドラを担う。編集ルール自体は tabModel に委譲する
- `app/hooks/useMeasureOps.ts`: measure 移動・追加・挿入・削除・複製と measure/range クリップボード操作を担う
- `app/hooks/useRangeSelection.ts`: ドラッグによる範囲選択状態とポインタイベント処理を担う
- `app/hooks/useDigitInput.ts`: フレット番号の 2 桁入力バッファを担う
- `app/hooks/useNotationZoom.ts`: 譜面/フレットボードのズーム率、ピンチジェスチャ、五線譜小節線オーバーレイのメトリクス計測を担う
- `app/services/tabFile.ts`: TAB データの JSON export/import(ファイル境界)を担う
- `app/services/musicXml.ts`: canonical model から MusicXML への format adapter(export のみ)を担う

## Core Flows
- エディタは tick 単位（4 分音符 = 24 tick）の内部グリッドで動作し、表示上は 16 分音符単位の列を維持する。拍子（4/4, 3/4, 2/4, 6/8）はドキュメント単位で選択でき、measure 容量はその拍子から導出される
- 音価を先に選び、その後セルまたはフレットボード上の位置を指定してフレット番号を入力する。選択中イベントがある場合は、そのイベント長をツールバーへ同期する
- Tie は選択中の note に付与/解除できる。空セル選択時に直前の同じ弦の note が存在する場合は、その note と同じフレットを Tie note として自動入力する。直前 note が存在しない場合は Tie 入力モードとして切り替わり、次に入力する note へ Tie を付与する。Tie は同一弦・同一フレットの直前 note から音を受けてつなぐ指定として扱い、譜面プレビューでは直前 note から Tie note へタイ曲線、TAB グリッドではフレット番号を括弧で囲んで表示する
- デスクトップでは数字キー、モバイルではテンキーからフレット番号を入力する。2 桁入力は短いバッファ時間内で結合され、確定後にノートを配置する
- フレットボードではタップで既定音価のノートを置き、フリックで音価と dotted/triplet modifier を含めて 1 アクションで配置できる
- 休符モードでは現在選択 step に休符を配置する。フリック休符入力でも同様に音価と modifier を反映する
- ノートまたは休符を配置した後、カーソルは入力長に応じて次の配置位置へ進む。最後の measure 末尾で編集している場合のみ、新しい measure を自動追加できる
- 既存イベントの持続中 step は新規開始位置としてブロックされる。選択がその範囲に入った場合はイベント開始 step へスナップする
- 入力モードは `Grid` と `Sequential` を持つ。`Grid` は既存イベントを動かさず、`Sequential` は既存イベントの音価変更時に後続イベントを左右へシフトする
- Measure 操作として前後移動、追加、挿入、削除、複製、measure 単位コピー/貼り付けを提供する。再生中は破壊的な編集を禁止する
- 範囲選択はドラッグで行うが、MVP では単一 measure 内にクランプされる。選択範囲は range copy/paste と範囲削除に使う
- Undo/Redo はローカル履歴で管理し、キーボードショートカットにも対応する
- Play を押すと現在 measure から step 単位で再生カーソルが進み、各 step 開始位置のイベントだけを発音する。overflow measure では remainder をスキップして次 measure へ進む。最後の measure まで到達すると停止し、選択は先頭へ戻る
- Tie された note の再生では、直前の同一弦・同一フレット note の発音を Tie note まで延長し、Tie note は再アタックしない
- Export は現在の TAB データを JSON または MusicXML としてダウンロードし、Import は JSON を normalize/sanitize して現在のエディタ状態へ読み込む
- MusicXML export は score-partwise + 6 線 TAB 譜(クレフ TAB、staff-tuning、string/fret)として書き出す。divisions = ticksPerQuarter、調号・拍子・テンポ・tie・dot・triplet を反映し、イベント間の空きは休符で充填する。measure 容量を超える overflow は切り詰める。MusicXML import は未対応
- 譜面エリアとフレットボードはピンチまたはスライダーで拡大縮小できる。モバイル時は初期スケールを小さめに補正する

## Data Model
- 永続化される主データは `localStorage` の `quick-tab:mvp:v4` に保存する
- 旧データ `quick-tab:mvp:v3`, `quick-tab:mvp:v2`, `quick-tab:mvp:v1` が存在する場合は、初回読込時に v4 モデルへ normalize して取り込む
- TAB データの基本構造は `TabData (= TabDataV4) = { version: "v4", tempo, timeSig, key?, ticksPerQuarter, tuning, measures }`
- 時間表現は tick が正本で、`ticksPerQuarter = 24`（コード上の `TICKS_PER_QUARTER` を正とする）。イベントの `step` / `len` は tick 値であり、v3 までの step と同一スケール（1 step = 1 tick）
- `timeSig` は `TimeSignature` 型（`"4/4" | "3/4" | "2/4" | "6/8"`）。measure 容量（tick 数）は `getMeasureTicks(timeSig)` で導出し、`stepsPerMeasure` フィールドは v4 では持たない。全拍子は measure 容量が 96 tick 以下になるよう選定されている
- 拍子変更時は既存イベントを保持し、新容量を超える部分は overflow として扱う
- `key` は `KeySignature` 型（`"C" | "G" | ... | "Cb"` の 15 キー）。省略時は `"C"` として扱う。`normalizeToTabData` でバリデーションし、不正値は `"C"` にフォールバックする
- `measures` は `[{ events: TabEvent[] }]` の配列で、各 `TabEvent` は note event または rest event を表す
- Note event は `step`, `len`, `notes`, optional `dot` / `triplet` を持ち、`notes` は `{ string, fret, technique?, tie? }[]` の配列で複数弦同時入力を表現する。`technique` は `"slide" | "hammer" | "pulloff" | "bend" | "vibrato"` のいずれかで、未設定の場合は通常奏法を意味する。`tie` は直前の同一弦・同一フレット note から音を受ける指定で、note 単位に保存する
- Rest event は `step`, `len`, `rest: true`, optional `dot` / `triplet` を持つ
- 16 分音符 = 6 tick として表現し、dotted / triplet を整数 tick で扱う
- Measure clipboard と range clipboard はメモリ上の一時状態であり、リロード後には残らない
- 選択セル、選択範囲、再生状態、再生カーソル、undo/redo 履歴、数字入力バッファ、ズーム率、モバイル判定は UI 状態であり永続化しない
- Import 時や保存復元時は `normalizeToTabData` と `sanitizeTabData` を通し、不正値や競合イベントを補正した上で扱う。異なる `ticksPerQuarter` を持つ v4 ファイルは読込時に 24 へリスケールする
- Sequential モードで発生した overflow event は、`allowOverflow=true` の sanitize 経路で保持する
- `getEventOccupiedSteps(event)` は dot/triplet を考慮した実効占有ステップ数を返す。`getMeasureOccupiedSteps` はその合計、`isMeasureOverflowing` は合計が `stepsPerMeasure` を超えるかを返す
- `shiftEventsFromStep(events, fromStep, deltaSteps)` は `fromStep` 以降の全イベントを `deltaSteps` だけずらす。step < 0 になるイベントは削除し、measure 容量超えはオーバーフローとして保持する
- Sequential モードのシフトは `getSequentialPlacementContext` / `applySequentialShift` / `applySequentialDeleteShift` の3関数に分離して `tabModel.ts` で管理する。ノート削除時も後続を左詰めする。各関数は `autoShift: boolean` を引数に取り、page.tsx 側で渡す

## Future Time Representation
- 現行 canonical model は `TabDataV4` の tick-based 表現（`ticksPerQuarter = 24`）。`96 stepsPerMeasure` 固定は撤廃済みで、measure 容量は拍子から導出する
- イベントのフィールド名は `step` / `len` のまま tick 値として扱う。`startTick` / `durationTick` への改名は外部形式 adapter 整備時に再検討する
- より細かい分解能（例: 480 TPQ）への引き上げは、複雑な tuplet 対応が必要になった時点で normalize のリスケール経路を使って行う
- `dot` / `triplet` は将来的には長さ計算の正本ではなく、入力補助または表示補助メタデータとして扱う余地を残す
- UI 上の 16 分単位グリッド、フリック入力、選択セルの挙動は直ちに廃止せず、内部 canonical model と表示スロットの変換層を介して段階的に移行する
- 互換機能を追加する場合も、外部形式を直接 UI に接続せず、`canonical model <-> format adapter` の境界を維持する
- 保存復元では旧バージョン（v3/v2/v1）読込時の normalize 経路を維持する

## Future Native Migration
- iPhone アプリ化を見据えるが、早期段階では Web 実装を先行し、入力体験と編集ルールの確立を優先する
- Swift / SwiftUI への移植を前提に、編集ルール、時間計算、sanitize、import/export、playback scheduling に関わるロジックは UI 層から分離して管理する
- 編集ロジックは `tabModel.ts` と周辺 hook / service へ分離済み。今後も UI 依存のない core を厚くする方針を維持する
- ネイティブ移植時も canonical model は共通仕様として維持し、Web と iOS で別々の譜面仕様を持たない
- gesture, selection, clipboard, playback cursor などの UI 挙動は platform ごとの差異を許容するが、編集結果の整合性は共通 core で担保する
- App Store 配布や iOS 固有機能への対応は将来の native UI 採用理由になりうるが、それ自体を理由に早期全面移植は行わない
- 移植判断は、Web 版で主要ユースケースの入力フロー、データモデル、undo/redo、永続化、互換境界が安定した後に行う

## Rules
- パラメータ範囲・初期値はコード上の定数を正とする。`SPEC.md` には重複記載しない
- 再生中は編集系操作を抑止する前提で扱う。入力 UI と measure 操作に同じ前提を保つ
- イベント配置ルール、競合解決、sanitize、legacy 互換は `app/tabModel.ts` を正とする
- 範囲選択は MVP では単一 measure に限定される。この制約を跨ぐ機能追加時は clipboard 仕様ごと見直す
- 大きな機能追加時も、まずは `page.tsx` と `tabModel.ts` の責務境界を崩さずに収めることを優先する
- `×` ボタンは event 単位削除、キーボード `Backspace/Delete` は選択弦の note 単位削除を基本とする
- Sequential シフトは「既存イベントの音価変更時」および「イベント削除時」に適用し、空ステップへの新規入力時には適用しない
- 将来の native 移植を見据え、UI 変更時も編集ルールを `page.tsx` に閉じ込めず、再利用可能な model / hook / service へ寄せる方針を優先する


## Known Issues
- 編集・選択・measure 操作などのロジックは hook / model へ分離済みだが、`page.tsx` は依然それらの統合点であり、hook 間の受け渡しインターフェースが広い
- 範囲選択は単一 measure に制限されており、複数 measure に跨る編集はまだ扱えない
- 保存先が `localStorage` のみのため、端末変更やブラウザデータ削除では消える
- 再生は step ベースの簡易プレイヤーで、細かなタイミング表現や高度な発音制御は行っていない
- 拍子はドキュメント単位で、measure ごとの拍子変更には未対応。`TICKS_PER_QUARTER = 24` は単純な音価には十分だが、複雑な tuplet には分解能引き上げが必要になりうる
- overflow event は measure ごとの表示幅を伸ばして TAB / 五線譜上に可視化し、その領域も通常 step と同様に選択・編集できる
- 再生は overflow remainder をスキップして次 measure へ進む。表示上の overflow 領域を再生時間軸へどう統合するかは未整理で、将来の仕様見直し余地がある
- 現在の措置は横スクロール1行レイアウト前提。将来の折り返し複数行レイアウト対応時は measure ごとの `displayColumns` 計算を導入する予定
