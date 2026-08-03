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

function CardTagDimensionField({
  id,
  label,
  emptyLabel,
  options,
  selected,
  onChange,
}: {
  id: string;
  label: string;
  emptyLabel: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  if (options.length === 0) return null;
  const selectedSet = new Set(selected);
  const selectionSummary = formatCardTagSelectionSummary(selected, emptyLabel);

  return (
    <div className="field-label card-tag-dimension-filter">
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
              <span>{formatCardTagOption(tag)}</span>
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
    <CardTagDimensionField
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
