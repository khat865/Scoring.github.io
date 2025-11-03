import json

# ====== 路径设置 ======
data_file = "data.json"          
target_file = "scin_final_diagnosis_evaluation.json"      
output_file = "data_updated.json"

# ====== 加载文件 ======
with open(data_file, "r", encoding="utf-8") as f:
    data = json.load(f)

with open(target_file, "r", encoding="utf-8") as f:
    target = json.load(f)

# ====== 构建 case_id -> diagnosis 映射 ======
mapping = {}
for case in target.get("per_sample_results", []):
    case_id = case.get("case_id")
    if case_id:
        mapping[case_id] = {
            "predicted_diagnosis": case.get("predicted_diagnosis", ""),
            "ground_truth_diagnosis": case.get("ground_truth_diagnosis", "")
        }

# ====== 替换匹配项 ======
count_updated = 0
for item in data:
    case_id = item.get("id")
    if case_id in mapping:
        item["predicted_diagnosis"] = mapping[case_id]["predicted_diagnosis"]
        item["ground_truth_diagnosis"] = mapping[case_id]["ground_truth_diagnosis"]
        count_updated += 1

# ====== 保存更新后的文件 ======
with open(output_file, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=4, ensure_ascii=False)

print(f"✅ 完成更新：共匹配并替换 {count_updated} 个病例。")
print(f"输出文件：{output_file}")
