import { useState } from "react";
import { isValidStudyDayStartTime } from "../utils/studyDay";

type StudyDaySettingsProps = {
  value: string;
  onChange: (value: string) => void;
};

type StartMode = "midnight" | "four" | "custom";

function getMode(value: string): StartMode {
  if (value === "00:00") return "midnight";
  if (value === "04:00") return "four";
  return "custom";
}

export function StudyDaySettings({ value, onChange }: StudyDaySettingsProps) {
  const [customTime, setCustomTime] = useState(
    value !== "00:00" && value !== "04:00" ? value : "05:30",
  );
  const mode = getMode(value);
  const [customHour, customMinute] = customTime.split(":");

  function selectMode(nextMode: StartMode) {
    if (nextMode === "midnight") onChange("00:00");
    if (nextMode === "four") onChange("04:00");
    if (nextMode === "custom") {
      onChange(isValidStudyDayStartTime(customTime) ? customTime : "05:30");
    }
  }

  function updateCustomTime(nextTime: string) {
    setCustomTime(nextTime);
    if (isValidStudyDayStartTime(nextTime)) onChange(nextTime);
  }

  function updateCustomHour(hour: string) {
    updateCustomTime(`${hour}:${customMinute}`);
  }

  function updateCustomMinute(minute: string) {
    updateCustomTime(`${customHour}:${minute}`);
  }

  return (
    <section className="study-day-settings" aria-labelledby="study-day-title">
      <div className="study-day-heading">
        <div>
          <p className="eyebrow">STUDY DAY</p>
          <h2 id="study-day-title">하루 시작 시간</h2>
        </div>
        <strong aria-label={`현재 하루 시작 시간 ${value}`}>{value}</strong>
      </div>

      <fieldset className="study-day-options">
        <legend className="sr-only">하루 시작 시간 선택</legend>
        <label className={mode === "midnight" ? "is-selected" : ""}>
          <input
            type="radio"
            name="study-day-start"
            checked={mode === "midnight"}
            onChange={() => selectMode("midnight")}
          />
          <span>자정</span>
          <small>00:00</small>
        </label>
        <label className={mode === "four" ? "is-selected" : ""}>
          <input
            type="radio"
            name="study-day-start"
            checked={mode === "four"}
            onChange={() => selectMode("four")}
          />
          <span>새벽 4시</span>
          <small>04:00</small>
        </label>
        <label className={mode === "custom" ? "is-selected" : ""}>
          <input
            type="radio"
            name="study-day-start"
            checked={mode === "custom"}
            onChange={() => selectMode("custom")}
          />
          <span>직접 설정</span>
          <span className="study-day-time-controls">
            <select
              value={customHour}
              disabled={mode !== "custom"}
              aria-label="직접 설정 시간"
              onChange={(event) => updateCustomHour(event.target.value)}
            >
              {Array.from({ length: 24 }, (_, hour) =>
                String(hour).padStart(2, "0"),
              ).map((hour) => (
                <option key={hour} value={hour}>
                  {hour}
                </option>
              ))}
            </select>
            <span aria-hidden="true">:</span>
            <select
              value={customMinute}
              disabled={mode !== "custom"}
              aria-label="직접 설정 분"
              onChange={(event) => updateCustomMinute(event.target.value)}
            >
              {Array.from({ length: 60 }, (_, minute) =>
                String(minute).padStart(2, "0"),
              ).map((minute) => (
                <option key={minute} value={minute}>
                  {minute}
                </option>
              ))}
            </select>
          </span>
        </label>
      </fieldset>

      <p className="study-day-help">
        설정한 시간 전의 학습은 전날 기록으로 계산됩니다.
      </p>
    </section>
  );
}
