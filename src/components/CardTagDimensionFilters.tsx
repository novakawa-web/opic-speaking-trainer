import { useId } from "react";
import {
  formatCardTagOption,
  formatCardTagSelectionSummary,
  getCardTagFilterOptions,
  normalizeCardTagSelection,
  type CardTagDimensionFilters as CardTagDimensionFilterValues,
} from "../utils/cardTagFilters";

type DimensionConfig = {
  key: keyof CardTagDimensionFilterValues;
  label: string;
  emptyLabel: string;
  options: string[];
};

type Props = CardTagDimensionFilterValues & {
  tags: readonly string[];
  onChange: (next: CardTagDimensionFilterValues) => void;
};

export function CardTagMultiSelectField({
  id,
  label,
  emptyLabel,
  options,
  selected,
  onChange,
  formatOption = formatCardTagOption,
}: {
  id: string;
  label: string;
  emptyLabel: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  formatOption?: (tag: string) => string;
}) {
  if (options.length === 0) return null;
  const selectedSet = new Set(selected);
  const selectionSummary = formatCardTagSelectionSummary(selected, emptyLabel, formatOption);

  return (
    <div className={`field-label card-tag-dimension-filter ${selected.length > 0 ? "has-selection" : ""}`}>
      <span id={`${id}-label`}>{label}</span>
      <details>
        <summary
          aria-label={`${label}: ${selectionSummary}`}
          aria-describedby={`${id}-label`}
        >
          <span>{selectionSummary}</span>
          <span className="card-tag-dimension-chevron" aria-hidden="true">⌄</span>
        </summary>
        <div className="card-tag-dimension-options" role="group" aria-labelledby={`${id}-label`}>
          {options.map((tag) => (
            <label key={tag} title={tag}>
              <input
                type="checkbox"
                checked={selectedSet.has(tag)}
                onChange={() =>
                  onChange(
                    normalizeCardTagSelection(
                      selectedSet.has(tag)
                        ? selected.filter((value) => value !== tag)
                        : [...selected, tag],
                    ),
                  )
                }
              />
              <span>{formatOption(tag)}</span>
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}

export function CardTagDimensionFilters({
  tags,
  selectedWeeks,
  selectedTopics,
  selectedTypes,
  onChange,
}: Props) {
  const baseId = useId();
  const options = getCardTagFilterOptions(tags);
  const configs: DimensionConfig[] = [
    { key: "selectedWeeks", label: "학습 세트", emptyLabel: "전체 학습 세트", options: options.weeks },
    { key: "selectedTopics", label: "주제", emptyLabel: "전체 주제", options: options.topics },
    { key: "selectedTypes", label: "질문 유형", emptyLabel: "전체 유형", options: options.types },
  ];
  const values = { selectedWeeks, selectedTopics, selectedTypes };

  return configs.map((config) => (
    <CardTagMultiSelectField
      key={config.key}
      id={`${baseId}-${config.key}`}
      label={config.label}
      emptyLabel={config.emptyLabel}
      options={config.options}
      selected={values[config.key]}
      onChange={(next) => onChange({ ...values, [config.key]: next })}
    />
  ));
}
