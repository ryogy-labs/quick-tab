# Quick TAB

## Overview
ブラウザ上でギター TAB 譜を高速入力するための単一ページエディタ。譜面プレビュー、TAB グリッド、フレットボード入力、モバイル用テンキーを組み合わせ、短い操作で音価付きのノートや休符を配置できることを目的とする。

## Stack
- Framework: Next.js App Router + React + TypeScript
- Rendering: クライアントコンポーネント主体。譜面プレビューは独自 SVG 描画、音のプレビューは Web Audio で生成する
- Storage: 保存先はブラウザ `localStorage`。サーバー保存や同期機構は持たない

## Structure
- `app/page.tsx`: エディタ本体。選択状態、入力、再生、measure 操作、クリップボード、永続化、キーボードショートカットを統合管理する
- `app/tabModel.ts`: TAB データモデルと編集ルール。イベント衝突判定、sanitize、measure 操作、コピー/ペースト変換、legacy 互換を担う
- `app/components/StaffPreview.tsx`: TAB データから五線譜プレビューを描画する
- `app/components/FretboardInput.tsx`: フレットボード UI とフリック入力を扱う
- `app/components/MobileNumpad.tsx`: モバイル向け数字入力と休符入力を扱う
- `app/hooks/useFlickGesture.ts`: フリック方向から音価と modifier を確定する
- `app/hooks/usePlayback.ts`: Web Audio による発音と step 単位の再生カーソル進行を管理する
- `app/hooks/useTabStorage.ts`: localStorage への読み書きと legacy データ移行を担う
- `app/hooks/useUndoRedo.ts`: undo/redo スタック管理と canUndo/canRedo 状態を担う
- `app/hooks/useKeyboardShortcuts.ts`: キーボードショートカットのイベント登録を担う

## Core Flows
- エディタは 4/4・96 step 単位の内部グリッドで動作し、表示上は 16 分音符単位の列を維持する
- 音価を先に選び、その後セルまたはフレットボード上の位置を指定してフレット番号を入力する。選択中イベントがある場合は、そのイベント長をツールバーへ同期する
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
- Export は現在の TAB データを JSON としてダウンロードし、Import は JSON を normalize/sanitize して現在のエディタ状態へ読み込む
- 譜面エリアとフレットボードはピンチまたはスライダーで拡大縮小できる。モバイル時は初期スケールを小さめに補正する

## Data Model
- 永続化される主データは `localStorage` の `quick-tab:mvp:v3` に保存する
- 旧データ `quick-tab:mvp:v2`, `quick-tab:mvp:v1` が存在する場合は、初回読込時に v3 モデルへ normalize して取り込む
- TAB データの基本構造は `TabDataV3 = { version, tempo, timeSig, stepsPerMeasure, tuning, measures }`
- `measures` は `[{ events: TabEvent[] }]` の配列で、各 `TabEvent` は note event または rest event を表す
- Note event は `step`, `len`, `notes`, optional `dot` / `triplet` を持ち、`notes` は `{ string, fret, technique? }[]` の配列で複数弦同時入力を表現する。`technique` は `"slide" | "hammer" | "pulloff" | "bend" | "vibrato"` のいずれかで、未設定の場合は通常奏法を意味する
- Rest event は `step`, `len`, `rest: true`, optional `dot` / `triplet` を持つ
- `stepsPerMeasure` は 96 を基本とし、16 分音符 = 6 step として表現する。これにより dotted / triplet を整数 step で扱う
- Measure clipboard と range clipboard はメモリ上の一時状態であり、リロード後には残らない
- 選択セル、選択範囲、再生状態、再生カーソル、undo/redo 履歴、数字入力バッファ、ズーム率、モバイル判定は UI 状態であり永続化しない
- Import 時や保存復元時は `normalizeToTabDataV3` と `sanitizeTabDataV3` を通し、不正値や競合イベントを補正した上で扱う
- Sequential モードで発生した overflow event は、`allowOverflow=true` の sanitize 経路で保持する
- `getEventOccupiedSteps(event)` は dot/triplet を考慮した実効占有ステップ数を返す。`getMeasureOccupiedSteps` はその合計、`isMeasureOverflowing` は合計が `stepsPerMeasure` を超えるかを返す
- `shiftEventsFromStep(events, fromStep, deltaSteps)` は `fromStep` 以降の全イベントを `deltaSteps` だけずらす。step < 0 になるイベントは削除し、`stepsPerMeasure` 超えはオーバーフローとして保持する
- Sequential モードのシフトは `getSequentialPlacementContext` / `applySequentialShift` / `applySequentialDeleteShift` の3関数に分離して `tabModel.ts` で管理する。ノート削除時も後続を左詰めする。各関数は `autoShift: boolean` を引数に取り、page.tsx 側で渡す

## Future Time Representation
- 現行 MVP の canonical model は `TabDataV3` の step-based 表現を維持する
- 将来の外部譜面形式互換と複雑な音価対応を見据え、次期 canonical model では step-based 表現から tick-based 表現への移行を検討対象とする
- 次期モデルの方向性は `ticksPerQuarter` と event 単位の `startTick` / `durationTick` を基本とし、`96 stepsPerMeasure` 固定を最終仕様とはみなさない
- `dot` / `triplet` は将来的には長さ計算の正本ではなく、入力補助または表示補助メタデータとして扱う余地を残す
- UI 上の 16 分単位グリッド、フリック入力、選択セルの挙動は直ちに廃止せず、内部 canonical model と表示スロットの変換層を介して段階的に移行する
- 互換機能を追加する場合も、外部形式を直接 UI に接続せず、`canonical model <-> format adapter` の境界を維持する
- `TabDataV3` から次期 tick-based モデルへの migration を前提にし、保存復元では旧バージョン読込時の normalize 経路を維持する

## Future Native Migration
- iPhone アプリ化を見据えるが、早期段階では Web 実装を先行し、入力体験と編集ルールの確立を優先する
- Swift / SwiftUI への移植を前提に、編集ルール、時間計算、sanitize、import/export、playback scheduling に関わるロジックは UI 層から分離して管理する
- `page.tsx` は一時的に統合責務を担うが、将来的には `tabModel.ts` と周辺 hook / service にロジックを寄せ、UI 依存のない core を厚くする
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
- `app/page.tsx` に UI 状態、再生、永続化、ショートカット、clipboard 処理が集中しており変更影響範囲が広い
- 範囲選択は単一 measure に制限されており、複数 measure に跨る編集はまだ扱えない
- 保存先が `localStorage` のみのため、端末変更やブラウザデータ削除では消える
- 再生は step ベースの簡易プレイヤーで、細かなタイミング表現や高度な発音制御は行っていない
- `96 stepsPerMeasure` 固定は MVP としては合理的だが、将来の Guitar Pro / MusicXML 互換や複雑な tuplet 対応の最終解ではない
- overflow event は measure ごとの表示幅を伸ばして TAB / 五線譜上に可視化し、その領域も通常 step と同様に選択・編集できる
- 再生は overflow remainder をスキップして次 measure へ進む。表示上の overflow 領域を再生時間軸へどう統合するかは未整理で、将来の仕様見直し余地がある
- 現在の措置は横スクロール1行レイアウト前提。将来の折り返し複数行レイアウト対応時は measure ごとの `displayColumns` 計算を導入する予定
