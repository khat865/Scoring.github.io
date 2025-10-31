import json
import random

def process_evaluation_data(input_file, output_file, image_base_path="images"):
    """
    从评估JSON中提取数据，为评分系统生成正确格式
    """
    
    # 读取原始数据
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    processed_cases = []
    
    # 处理每个样本
    for sample in data.get('per_sample_results', []):
        case_id = sample.get('pmc_id') or sample.get('id')
        
        # 提取预测和真实的鉴别诊断列表
        pred_diff = sample.get('predicted_differential_diagnosis', '')
        truth_diff = sample.get('ground_truth_differential_diagnosis', '')
        
        # 分割成列表（用 | 分隔）
        pred_diff_list = [d.strip() for d in pred_diff.split('|') if d.strip()]
        truth_diff_list = [d.strip() for d in truth_diff.split('|') if d.strip()]
        
        # 任务3：随机选择一个predicted和一个ground_truth
        task3_option_a = random.choice(pred_diff_list) if pred_diff_list else "无预测鉴别诊断"
        task3_option_b = random.choice(truth_diff_list) if truth_diff_list else "无真实鉴别诊断"
        
        # 构建病例数据
        case_data = {
            "id": sample.get('id'),
            "pmid": case_id,
            
            # 任务1数据：图片路径（需要从原始数据获取）
            "image_paths": sample.get('image_paths', []),
            
            # 任务1的文本：使用predicted_diagnosis
            "prompt": sample.get('predicted_diagnosis', ''),
            
            # 任务2数据
            "predicted_diagnosis": sample.get('predicted_diagnosis', ''),
            "ground_truth_diagnosis": sample.get('ground_truth_diagnosis', ''),
            
            # 任务3数据：从鉴别诊断中随机选择
            "task3_option_a": task3_option_a,
            "task3_option_b": task3_option_b,
            
            # 保存完整的鉴别诊断列表（用于调试或其他用途）
            "predicted_differential_diagnosis_full": pred_diff_list,
            "ground_truth_differential_diagnosis_full": truth_diff_list
        }
        
        processed_cases.append(case_data)
    
    # 保存处理后的数据
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(processed_cases, f, ensure_ascii=False, indent=2)
    
    print(f"成功处理 {len(processed_cases)} 个病例")
    print(f"数据已保存到: {output_file}")
    
    return processed_cases


# 示例：如何使用这个脚本
if __name__ == "__main__":
    # 从你的评估JSON文件生成评分系统的数据
    input_file = "E:/medical/results/EXAMPLE-internvl3-8B/qwen3-8B/unified_evaluation_report.json"  # 你的原始JSON文件
    output_file = "data.json"  # 输出给评分系统使用
    
    processed_data = process_evaluation_data(input_file, output_file)
    
    # 打印第一个病例作为示例
    if processed_data:
        print("\n第一个病例示例:")
        print(json.dumps(processed_data[0], ensure_ascii=False, indent=2))