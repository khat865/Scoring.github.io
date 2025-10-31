import json
import random

def calculate_similarity(diag1, diag2):
    """
    计算两个诊断之间的相似度（Jaccard相似度）
    """
    words1 = set(diag1.lower().split())
    words2 = set(diag2.lower().split())
    
    if len(words1) == 0 and len(words2) == 0:
        return 0.0
    
    intersection = len(words1.intersection(words2))
    union = len(words1.union(words2))
    
    return intersection / union if union > 0 else 0.0

def get_dermlip_similarity(similarity_matrix, pred_idx, truth_idx):
    """
    从相似度矩阵中获取相似度分数
    """
    try:
        if similarity_matrix and len(similarity_matrix) > pred_idx:
            if len(similarity_matrix[pred_idx]) > truth_idx:
                return similarity_matrix[pred_idx][truth_idx]
    except:
        pass
    return None

def process_combined_data(base_json_file, evaluation_json_file, output_file, use_dermlip=True):
    """
    合并基础JSON（包含prompt和pmid）和评估JSON（包含诊断数据）
    生成用于评分系统的完整数据
    
    参数:
        base_json_file: 基础JSON文件路径（您提供的新格式，包含prompt、pmid、image_paths）
        evaluation_json_file: 评估JSON文件路径（包含诊断和相似度数据）
        output_file: 输出文件路径
        use_dermlip: 是否使用DermLIP相似度矩阵
    """
    
    # 读取基础JSON
    print(f"读取基础JSON: {base_json_file}")
    with open(base_json_file, 'r', encoding='utf-8') as f:
        base_data = json.load(f)
    
    # 读取评估JSON
    print(f"读取评估JSON: {evaluation_json_file}")
    with open(evaluation_json_file, 'r', encoding='utf-8') as f:
        eval_data = json.load(f)
    
    # 检查评估JSON的结构
    # 尝试不同的可能结构
    eval_samples = None
    
    if isinstance(eval_data, list):
        # 如果eval_data本身就是列表
        eval_samples = eval_data
        print(f"评估JSON是列表格式，包含 {len(eval_samples)} 个样本")
    elif isinstance(eval_data, dict):
        # 尝试常见的字段名
        for key in ['per_sample_results', 'results', 'samples', 'data', 'cases']:
            if key in eval_data:
                eval_samples = eval_data[key]
                print(f"评估JSON使用字段 '{key}'，包含 {len(eval_samples)} 个样本")
                break
        
        if eval_samples is None:
            # 如果没有找到，打印可用的键
            print(f"⚠️  警告: 在评估JSON中未找到标准字段")
            print(f"可用的顶层字段: {list(eval_data.keys())}")
            
            # 尝试使用第一个列表类型的值
            for key, value in eval_data.items():
                if isinstance(value, list) and len(value) > 0:
                    eval_samples = value
                    print(f"使用字段 '{key}'，包含 {len(eval_samples)} 个样本")
                    break
    
    if eval_samples is None or len(eval_samples) == 0:
        print("❌ 错误: 无法从评估JSON中提取样本数据")
        print("请检查评估JSON的格式")
        return []
    
    # 创建pmid到评估数据的映射
    eval_map = {}
    pmid_fields = ['pmc_id', 'pmid', 'id', 'case_id']
    
    for sample in eval_samples:
        pmid = None
        # 尝试多个可能的pmid字段名
        for field in pmid_fields:
            if field in sample:
                pmid = str(sample[field])
                break
        
        if pmid:
            eval_map[pmid] = sample
        else:
            print(f"⚠️  警告: 样本缺少PMID字段，可用字段: {list(sample.keys())[:5]}...")
    
    print(f"成功建立 {len(eval_map)} 个PMID映射")
    
    processed_cases = []
    matched_count = 0
    skipped_pmids = []
    
    # 处理每个基础病例
    for idx, base_case in enumerate(base_data):
        pmid = str(base_case.get('pmid', ''))
        
        if not pmid:
            print(f"⚠️  警告: 基础JSON中的索引 {idx} 缺少pmid字段")
            continue
        
        # 查找对应的评估数据
        eval_sample = eval_map.get(pmid)
        
        if not eval_sample:
            print(f"警告: PMID {pmid} 在评估JSON中未找到，跳过")
            skipped_pmids.append(pmid)
            continue
        
        matched_count += 1
        
        # 提取鉴别诊断 - 尝试多种可能的字段名
        pred_diff = ''
        truth_diff = ''
        
        # 预测鉴别诊断的可能字段名
        for field in ['predicted_differential_diagnosis', 'pred_diff_diagnosis', 'predicted_diagnoses']:
            if field in eval_sample:
                pred_diff = eval_sample[field]
                break
        
        # 真实鉴别诊断的可能字段名
        for field in ['ground_truth_differential_diagnosis', 'gt_diff_diagnosis', 'ground_truth_diagnoses']:
            if field in eval_sample:
                truth_diff = eval_sample[field]
                break
        
        # 如果没有鉴别诊断，尝试使用主诊断
        if not pred_diff:
            pred_diff = eval_sample.get('predicted_diagnosis', '')
        if not truth_diff:
            truth_diff = eval_sample.get('ground_truth_diagnosis', '')
        
        # 分割成列表
        if isinstance(pred_diff, str):
            pred_diff_list = [d.strip() for d in pred_diff.split('|') if d.strip()]
        elif isinstance(pred_diff, list):
            pred_diff_list = pred_diff
        else:
            pred_diff_list = []
        
        if isinstance(truth_diff, str):
            truth_diff_list = [d.strip() for d in truth_diff.split('|') if d.strip()]
        elif isinstance(truth_diff, list):
            truth_diff_list = truth_diff
        else:
            truth_diff_list = []
        
        # 如果列表为空，使用占位符
        if not pred_diff_list:
            pred_diff_list = [eval_sample.get('predicted_diagnosis', '无预测诊断')]
        if not truth_diff_list:
            truth_diff_list = [eval_sample.get('ground_truth_diagnosis', '无真实诊断')]
        
        # 获取相似度矩阵
        similarity_matrix = None
        if use_dermlip:
            dermlip_metrics = eval_sample.get('differential_diagnosis_metrics_dermlip', {})
            similarity_matrix = dermlip_metrics.get('similarity_matrix', None)
        
        # 创建任务3的两对诊断
        task3_pairs = []
        
        if len(pred_diff_list) >= 2 and len(truth_diff_list) >= 2:
            # 随机选择两个predicted和两个ground_truth
            selected_pred = random.sample(pred_diff_list, min(2, len(pred_diff_list)))
            selected_truth = random.sample(truth_diff_list, min(2, len(truth_diff_list)))
            
            for i in range(2):
                pred_diag = selected_pred[i] if i < len(selected_pred) else selected_pred[0]
                truth_diag = selected_truth[i] if i < len(selected_truth) else selected_truth[0]
                
                # 计算相似度
                similarity = 0.0
                if similarity_matrix:
                    try:
                        pred_idx = pred_diff_list.index(pred_diag)
                        truth_idx = truth_diff_list.index(truth_diag)
                        sim = get_dermlip_similarity(similarity_matrix, pred_idx, truth_idx)
                        if sim is not None:
                            similarity = sim
                        else:
                            similarity = calculate_similarity(pred_diag, truth_diag)
                    except (ValueError, IndexError):
                        similarity = calculate_similarity(pred_diag, truth_diag)
                else:
                    similarity = calculate_similarity(pred_diag, truth_diag)
                
                task3_pairs.append({
                    "pair_id": chr(65 + i),  # A, B
                    "predicted": pred_diag,
                    "ground_truth": truth_diag,
                    "similarity": round(similarity, 4)
                })
        else:
            # 数据不足时的处理
            for i in range(2):
                pred_diag = pred_diff_list[i % len(pred_diff_list)] if pred_diff_list else "无预测诊断"
                truth_diag = truth_diff_list[i % len(truth_diff_list)] if truth_diff_list else "无真实诊断"
                
                similarity = calculate_similarity(pred_diag, truth_diag) if pred_diff_list and truth_diff_list else 0.0
                
                task3_pairs.append({
                    "pair_id": chr(65 + i),
                    "predicted": pred_diag,
                    "ground_truth": truth_diag,
                    "similarity": round(similarity, 4)
                })
        
        # 构建完整的病例数据
        case_data = {
            "id": str(idx),
            "pmid": pmid,
            
            # 任务1数据：图片和描述（从基础JSON）
            "image_paths": base_case.get('image_paths', []),
            "prompt": base_case.get('prompt', ''),
            
            # 任务2数据：主诊断（从评估JSON）
            "predicted_diagnosis": eval_sample.get('predicted_diagnosis', ''),
            "ground_truth_diagnosis": eval_sample.get('ground_truth_diagnosis', ''),
            
            # 任务3数据：两对鉴别诊断及相似度
            "task3_pairs": task3_pairs,
            
            # 保存完整列表用于调试
            "predicted_differential_diagnosis_full": pred_diff_list,
            "ground_truth_differential_diagnosis_full": truth_diff_list
        }
        
        processed_cases.append(case_data)
    
    # 保存处理后的数据
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(processed_cases, f, ensure_ascii=False, indent=2)
    
    print(f"\n✅ 处理完成!")
    print(f"  基础JSON中的病例数: {len(base_data)}")
    print(f"  评估JSON中的样本数: {len(eval_samples)}")
    print(f"  成功匹配的病例数: {matched_count}")
    print(f"  数据已保存到: {output_file}")
    
    if skipped_pmids:
        print(f"\n⚠️  以下PMID在评估JSON中未找到 (共{len(skipped_pmids)}个):")
        for pmid in skipped_pmids[:10]:  # 只显示前10个
            print(f"    - {pmid}")
        if len(skipped_pmids) > 10:
            print(f"    ... 还有 {len(skipped_pmids)-10} 个")
    
    # 统计相似度分布
    pairs_with_high_similarity = sum(1 for case in processed_cases 
                                     for pair in case['task3_pairs'] 
                                     if pair['similarity'] > 0.5)
    total_pairs = sum(len(case['task3_pairs']) for case in processed_cases)
    print(f"  相似度 > 0.5 的对数: {pairs_with_high_similarity}/{total_pairs}")
    
    return processed_cases


# 示例：如何使用这个脚本
if __name__ == "__main__":
    # 设置文件路径
    base_json_file = "medical_data.json"  # ← 您提供的包含prompt和pmid的JSON
    evaluation_json_file = "G:/xwechat_files/wxid_yrfatm6mxz6f22_86cd/msg/file/2025-10/Qwen3_8B_unified_evaluation_report_dermlip_scores.json"  # ← 原始的评估JSON
    output_file = "data.json"  # ← 输出给评分系统使用
    
    print("=" * 60)
    print("医学图像评分系统 - 数据处理脚本 v2.1")
    print("=" * 60)
    print()
    
    try:
        processed_data = process_combined_data(
            base_json_file=base_json_file,
            evaluation_json_file=evaluation_json_file,
            output_file=output_file,
            use_dermlip=True
        )
        
        if not processed_data:
            print("\n❌ 没有生成任何数据，请检查输入文件")
        else:
            # 打印第一个病例作为示例
            print("\n" + "=" * 60)
            print("第一个病例示例:")
            print("=" * 60)
            print(json.dumps(processed_data[0], ensure_ascii=False, indent=2))
            
            if 'task3_pairs' in processed_data[0]:
                print("\n任务3的两对诊断:")
                for pair in processed_data[0]['task3_pairs']:
                    print(f"\n{pair['pair_id']}对:")
                    print(f"  预测: {pair['predicted']}")
                    print(f"  真实: {pair['ground_truth']}")
                    print(f"  相似度: {pair['similarity']}")
                    
    except FileNotFoundError as e:
        print(f"\n❌ 错误: 文件未找到 - {e}")
        print("\n请确保以下文件存在:")
        print(f"  1. {base_json_file} (基础JSON，包含prompt和pmid)")
        print(f"  2. {evaluation_json_file} (评估JSON，包含诊断数据)")
    except json.JSONDecodeError as e:
        print(f"\n❌ JSON格式错误: {e}")
        print("请检查JSON文件格式是否正确")
    except Exception as e:
        print(f"\n❌ 发生错误: {e}")
        import traceback
        traceback.print_exc()