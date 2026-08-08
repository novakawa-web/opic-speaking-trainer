type FavoriteButtonProps = {
  isFavorite: boolean;
  onToggle: () => void;
  className?: string;
};

export function FavoriteButton({
  isFavorite,
  onToggle,
  className = "",
}: FavoriteButtonProps) {
  const label = isFavorite ? "이 문제 즐겨찾기 해제" : "이 문제 즐겨찾기 추가";
  return (
    <button
      type="button"
      className={`favorite-button ${isFavorite ? "is-favorite" : ""} ${className}`.trim()}
      aria-label={label}
      aria-pressed={isFavorite}
      title={label}
      onClick={onToggle}
    >
      <span aria-hidden="true">{isFavorite ? "♥" : "♡"}</span>
    </button>
  );
}
