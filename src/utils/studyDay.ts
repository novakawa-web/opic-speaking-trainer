export const STUDY_DAY_START_STORAGE_KEY = "opic-study-day-start-time";
export const DEFAULT_STUDY_DAY_START_TIME = "04:00";

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function isValidStudyDayStartTime(value: unknown): value is string {
  return typeof value === "string" && TIME_PATTERN.test(value);
}

export function readStudyDayStartTime() {
  try {
    const storedValue = localStorage.getItem(STUDY_DAY_START_STORAGE_KEY);
    return isValidStudyDayStartTime(storedValue)
      ? storedValue
      : DEFAULT_STUDY_DAY_START_TIME;
  } catch {
    return DEFAULT_STUDY_DAY_START_TIME;
  }
}

export function saveStudyDayStartTime(startTime: string) {
  if (!isValidStudyDayStartTime(startTime)) return;

  try {
    localStorage.setItem(STUDY_DAY_START_STORAGE_KEY, startTime);
  } catch {
    // Storage may be unavailable; current session state still updates.
  }
}

function toMinutes(startTime: string) {
  const validTime = isValidStudyDayStartTime(startTime)
    ? startTime
    : DEFAULT_STUDY_DAY_START_TIME;
  const [hours, minutes] = validTime.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getStudyDateKey(
  date = new Date(),
  startTime = DEFAULT_STUDY_DAY_START_TIME,
) {
  const studyDate = new Date(date.getTime());
  const currentMinutes = date.getHours() * 60 + date.getMinutes();

  if (currentMinutes < toMinutes(startTime)) {
    studyDate.setDate(studyDate.getDate() - 1);
  }

  return formatLocalDateKey(studyDate);
}
