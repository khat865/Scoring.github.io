import json
import random
import numpy as np

def calculate_similarity(diag1, diag2):
    """
    计算两个诊断之间的相似度
    这里使用简单的词汇重叠度作为相似度指标
    你可以根据实际需求替换为更复杂的相似度计算方法
    """
    # 转换为小写并分词
    words1 = set(diag1.lower().split())
    words2 = set(diag2.lower().split())
    
    # 计算Jaccard相似度
    if len(words1) == 0 and len(words2) == 0:
        return 0.0
    
    intersection = len(words1.intersection(words2))
    union = len(words1.union(words2))
    
    return intersection / union if union > 0 else 0.0

def get_dermlip_similarity(similarity_matrix, pred_idx, truth_idx):
    """
    从相似度矩阵中获取相似度分数
    """
    if similarity_matrix and len(similarity_matrix) > pred_idx:
        if len(similarity_matrix[pred_idx]) > truth_idx:
            return similarity_matrix[pred_idx][truth_idx]
    return 0.0

def process_evaluation_data(input_file, medical_data_file, output_file, use_dermlip=True):
    """
    从评估JSON中提取数据，为评分系统生成正确格式
    修改版：为任务3选择两对诊断并标记相似度
    新增：从medical_data.json读取image_paths
    """
    
    # 读取原始评估数据
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # 读取medical_data.json（包含image_paths）
    medical_map = {}
    try:
        with open(medical_data_file, 'r', encoding='utf-8') as f:
            medical_data = json.load(f)
            # 创建pmid到image_paths的映射
            for item in medical_data:
                pmid = item.get('pmid')
                if pmid:
                    medical_map[pmid] = item.get('image_paths', [])
        print(f"成功读取 {len(medical_map)} 个病例的图片路径")
    except FileNotFoundError:
        print(f"警告: 未找到 {medical_data_file}，将使用评估文件中的image_paths")
    except Exception as e:
        print(f"警告: 读取medical_data.json时出错: {e}")
    
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
        
        # 获取相似度矩阵（如果使用dermlip）
        similarity_matrix = None
        if use_dermlip:
            dermlip_metrics = sample.get('differential_diagnosis_metrics_dermlip', {})
            similarity_matrix = dermlip_metrics.get('similarity_matrix', None)
        
        # 任务3：选择两对诊断
        task3_pairs = []
        
        if len(pred_diff_list) >= 2 and len(truth_diff_list) >= 2:
            # 随机选择两个predicted诊断
            selected_pred = random.sample(pred_diff_list, min(2, len(pred_diff_list)))
            # 随机选择两个ground_truth诊断
            selected_truth = random.sample(truth_diff_list, min(2, len(truth_diff_list)))
            
            # 创建两对
            for i in range(2):
                pred_diag = selected_pred[i] if i < len(selected_pred) else selected_pred[0]
                truth_diag = selected_truth[i] if i < len(selected_truth) else selected_truth[0]
                
                # 计算相似度
                if similarity_matrix:
                    # 找到在原列表中的索引
                    try:
                        pred_idx = pred_diff_list.index(pred_diag)
                        truth_idx = truth_diff_list.index(truth_diag)
                        similarity = get_dermlip_similarity(similarity_matrix, pred_idx, truth_idx)
                    except (ValueError, IndexError):
                        similarity = calculate_similarity(pred_diag, truth_diag)
                else:
                    # 使用简单的词汇相似度
                    similarity = calculate_similarity(pred_diag, truth_diag)
                
                task3_pairs.append({
                    "pair_id": chr(65 + i),  # A, B
                    "predicted": pred_diag,
                    "ground_truth": truth_diag,
                    "similarity": round(similarity, 4)
                })
        
        elif len(pred_diff_list) >= 1 and len(truth_diff_list) >= 1:
            # 如果数量不足，尽可能创建对
            for i in range(min(2, min(len(pred_diff_list), len(truth_diff_list)))):
                pred_diag = pred_diff_list[i] if i < len(pred_diff_list) else pred_diff_list[0]
                truth_diag = truth_diff_list[i] if i < len(truth_diff_list) else truth_diff_list[0]
                
                if similarity_matrix:
                    try:
                        pred_idx = pred_diff_list.index(pred_diag)
                        truth_idx = truth_diff_list.index(truth_diag)
                        similarity = get_dermlip_similarity(similarity_matrix, pred_idx, truth_idx)
                    except (ValueError, IndexError):
                        similarity = calculate_similarity(pred_diag, truth_diag)
                else:
                    similarity = calculate_similarity(pred_diag, truth_diag)
                
                task3_pairs.append({
                    "pair_id": chr(65 + i),
                    "predicted": pred_diag,
                    "ground_truth": truth_diag,
                    "similarity": round(similarity, 4)
                })
        else:
            # 如果没有足够的诊断，创建空对
            task3_pairs = [
                {
                    "pair_id": "A",
                    "predicted": pred_diff_list[0] if pred_diff_list else "无预测鉴别诊断",
                    "ground_truth": truth_diff_list[0] if truth_diff_list else "无真实鉴别诊断",
                    "similarity": 0.0
                },
                {
                    "pair_id": "B",
                    "predicted": pred_diff_list[-1] if len(pred_diff_list) > 1 else (pred_diff_list[0] if pred_diff_list else "无预测鉴别诊断"),
                    "ground_truth": truth_diff_list[-1] if len(truth_diff_list) > 1 else (truth_diff_list[0] if truth_diff_list else "无真实鉴别诊断"),
                    "similarity": 0.0
                }
            ]
        
        # 获取image_paths：优先从medical_map，否则从sample
        image_paths = medical_map.get(case_id, sample.get('image_paths', []))
        
        # 构建病例数据
        case_data = {
            "id": sample.get('id'),
            "pmid": case_id,
            
            # 任务1数据：图片路径（从medical_data.json获取）
            "image_paths": image_paths,
            
            # 任务1的文本：使用predicted_diagnosis
            "prompt": sample.get('predicted_diagnosis', ''),
            
            # 任务2数据
            "predicted_diagnosis": sample.get('predicted_diagnosis', ''),
            "ground_truth_diagnosis": sample.get('ground_truth_diagnosis', ''),
            
            # 任务3数据：两对诊断及其相似度
            "task3_pairs": task3_pairs,
            
            # 保留原始数据用于调试
            "predicted_differential_diagnosis_full": pred_diff_list,
            "ground_truth_differential_diagnosis_full": truth_diff_list
        }
        
        processed_cases.append(case_data)
    
    # 保存处理后的数据
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(processed_cases, f, ensure_ascii=False, indent=2)
    
    print(f"成功处理 {len(processed_cases)} 个病例")
    print(f"数据已保存到: {output_file}")
    
    # 打印统计信息
    pairs_with_high_similarity = sum(1 for case in processed_cases 
                                     for pair in case['task3_pairs'] 
                                     if pair['similarity'] > 0.5)
    total_pairs = sum(len(case['task3_pairs']) for case in processed_cases)
    print(f"相似度 > 0.5 的对数: {pairs_with_high_similarity}/{total_pairs}")
    
    # 统计有image_paths的病例
    cases_with_images = sum(1 for case in processed_cases if case['image_paths'])
    print(f"有图片路径的病例数: {cases_with_images}/{len(processed_cases)}")
    
    return processed_cases


# 示例：如何使用这个脚本
if __name__ == "__main__":
    # 从你的评估JSON文件生成评分系统的数据
    input_file = "unified_evaluation_report.json"  # 你的原始评估JSON文件
    medical_data_file = "medical_data.json"  # 包含image_paths和prompt的JSON文件
    output_file = "data.json"  # 输出给评分系统使用
    
    processed_data = process_evaluation_data(
        input_file, 
        medical_data_file, 
        output_file, 
        use_dermlip=True
    )
    
    # 打印第一个病例作为示例
    if processed_data:
        print("\n第一个病例示例:")
        print(json.dumps(processed_data[0], ensure_ascii=False, indent=2))
        print("\n任务3的两对诊断:")
        for pair in processed_data[0]['task3_pairs']:
            print(f"\n{pair['pair_id']}对:")
            print(f"  预测: {pair['predicted']}")
            print(f"  真实: {pair['ground_truth']}")
            print(f"  相似度: {pair['similarity']}")