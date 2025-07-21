// RacecarFive.jsx
export default function RacecarFive({ size = 40, style = {} }) {
  return (
    <svg
      viewBox="0 0 60 75"
      width={size}
      height={size * 1.25}
      style={{ verticalAlign: "middle", ...style }}
    >
      {/* Clean, unified path with both fill and stroke */}
      <path
        d="M14 23 Q22 12, 37 13 Q54 13, 47 29 Q38 23, 22 30 Q19 42, 45 39 Q57 42, 47 59 Q43 70, 22 69 Q14 68, 15 59 Q28 60, 43 62 Z"
        fill="#ffed36"
        stroke="#00326b"
        strokeWidth="2"
      />
    </svg>
  );
}
