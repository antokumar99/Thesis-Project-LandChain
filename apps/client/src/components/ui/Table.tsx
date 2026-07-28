type Column<T> = {
  key: keyof T;
  label: string;
};

export function Table<T extends Record<string, unknown>>({ columns, rows }: { columns: Column<T>[]; rows: T[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[#d8dfda]">
      <table className="w-full border-collapse bg-white text-left text-sm">
        <thead className="bg-[#edf1ed] text-[#34433b]">
          <tr>
            {columns.map((column) => (
              <th className="px-4 py-3 font-semibold" key={String(column.key)}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr className="border-t border-[#e6ebe7]" key={index}>
              {columns.map((column) => (
                <td className="max-w-56 truncate px-4 py-3 text-[#17201b]" key={String(column.key)}>
                  {String(row[column.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
