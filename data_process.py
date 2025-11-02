import json
import random
import re
from typing import List, Dict, Tuple, Optional
import numpy as np
from datetime import datetime


def normalize_diagnosis(diag: str) -> str:
    """标准化诊断名称，用于匹配"""
    if not diag:
        return ""
    # 转小写，去除标点和多余空格
    diag = diag.lower().strip()
    diag = re.sub(r'[^\w\s]', ' ', diag)
    diag = re.sub(r'\s+', ' ', diag)
    return diag


def replace_path_prefix(image_paths: List[str]) -> List[str]:
    """
    替换图片路径前缀
    将 /gpfs/radev/pi/q_chen/zq65/Research/Data/DermDPO/datasets/eval/ 替换为 images/
    """
    old_prefix = "/gpfs/radev/pi/q_chen/zq65/Research/Data/DermDPO/datasets/eval/"
    new_prefix = "images/"
    
    replaced_paths = []
    replaced_count = 0
    for path in image_paths:
        if path.startswith(old_prefix):
            # 替换前缀
            new_path = new_prefix + path[len(old_prefix):]
            replaced_paths.append(new_path)
            replaced_count += 1
        else:
            # 如果不是目标前缀，保持原样
            replaced_paths.append(path)
    
    return replaced_paths, replaced_count


def diagnoses_match(diag1: str, diag2: str, threshold: float = 0.8) -> bool:
    """
    判断两个诊断是否匹配
    使用多种策略：完全匹配、包含关系、词汇重叠
    """
    if not diag1 or not diag2:
        return False
    
    d1 = normalize_diagnosis(diag1)
    d2 = normalize_diagnosis(diag2)
    
    # 完全匹配
    if d1 == d2:
        return True
    
    # 包含关系（长度相近）
    if d1 in d2 or d2 in d1:
        len_ratio = min(len(d1), len(d2)) / max(len(d1), len(d2))
        if len_ratio > threshold:
            return True
    
    # 词汇重叠度
    words1 = set(d1.split())
    words2 = set(d2.split())
    if words1 and words2:
        overlap = len(words1.intersection(words2)) / len(words1.union(words2))
        if overlap > threshold:
            return True
    
    return False


def match_case_by_gt(case_eval: Dict, medical_data: List[Dict], debug=False) -> Optional[Dict]:
    """
    通过ground_truth匹配病例
    返回匹配到的medical_data条目
    """
    eval_gt_list = case_eval.get('ground_truth_differential', [])
    if not eval_gt_list:
        return None
    
    # 标准化评估文件的GT
    eval_gt_normalized = [normalize_diagnosis(gt) for gt in eval_gt_list]
    
    best_match = None
    best_score = 0
    
    for med_item in medical_data:
        # 提取medical_data的GT
        med_gt = med_item.get('GT', {})
        med_gt_list = [v for k, v in med_gt.items() if k.startswith('label_')]
        
        if not med_gt_list:
            continue
        
        # 标准化medical_data的GT
        med_gt_normalized = [normalize_diagnosis(gt) for gt in med_gt_list]
        
        # 计算匹配分数
        match_count = 0
        for eval_gt in eval_gt_normalized:
            for med_gt in med_gt_normalized:
                if diagnoses_match(eval_gt, med_gt):
                    match_count += 1
                    break
        
        # 计算匹配率
        match_score = match_count / max(len(eval_gt_normalized), len(med_gt_normalized))
        
        if match_score > best_score:
            best_score = match_score
            best_match = med_item
    
    # 只有匹配度超过阈值才返回
    if best_score >= 0.5:
        return best_match
    
    return None


def calculate_similarity_variance(task3_pairs: List[Dict]) -> float:
    """
    计算task3_pairs中相似度的波动程度
    返回标准差，波动越大值越高
    """
    if not task3_pairs or len(task3_pairs) < 2:
        return 0.0
    
    similarities = [pair.get('similarity', 0.0) for pair in task3_pairs]
    
    # 计算标准差
    return float(np.std(similarities))


def calculate_similarity_range(task3_pairs: List[Dict]) -> float:
    """
    计算task3_pairs中相似度的极差（最大值-最小值）
    """
    if not task3_pairs or len(task3_pairs) < 2:
        return 0.0
    
    similarities = [pair.get('similarity', 0.0) for pair in task3_pairs]
    return max(similarities) - min(similarities)


def get_dermlip_similarity(similarity_matrix, pred_idx: int, truth_idx: int) -> float:
    """从相似度矩阵中获取相似度分数"""
    if similarity_matrix and len(similarity_matrix) > pred_idx:
        if len(similarity_matrix[pred_idx]) > truth_idx:
            return similarity_matrix[pred_idx][truth_idx]
    return 0.0


def calculate_jaccard_similarity(diag1: str, diag2: str) -> float:
    """计算两个诊断之间的Jaccard相似度"""
    words1 = set(normalize_diagnosis(diag1).split())
    words2 = set(normalize_diagnosis(diag2).split())
    
    if len(words1) == 0 and len(words2) == 0:
        return 0.0
    
    intersection = len(words1.intersection(words2))
    union = len(words1.union(words2))
    
    return intersection / union if union > 0 else 0.0


def generate_task3_pairs(
    pred_diff_list: List[str],
    truth_diff_list: List[str],
    similarity_matrix: Optional[List[List[float]]] = None
) -> List[Dict]:
    """
    生成task3的两对诊断，优先选择相似度差异大的对
    """
    if len(pred_diff_list) < 2 or len(truth_diff_list) < 2:
        # 数量不足，创建默认对
        return create_default_pairs(pred_diff_list, truth_diff_list, similarity_matrix)
    
    # 计算所有可能的配对及其相似度
    all_pairs = []
    for i, pred in enumerate(pred_diff_list):
        for j, truth in enumerate(truth_diff_list):
            if similarity_matrix and i < len(similarity_matrix) and j < len(similarity_matrix[i]):
                similarity = similarity_matrix[i][j]
            else:
                similarity = calculate_jaccard_similarity(pred, truth)
            
            all_pairs.append({
                'pred_idx': i,
                'truth_idx': j,
                'predicted': pred,
                'ground_truth': truth,
                'similarity': round(similarity, 4)
            })
    
    # 策略：选择相似度差异最大的两对
    # 尝试所有两对组合，找出相似度差异最大的
    best_variance = -1
    best_pair_combo = None
    
    for i in range(len(all_pairs)):
        for j in range(i + 1, len(all_pairs)):
            pair1 = all_pairs[i]
            pair2 = all_pairs[j]
            
            # 确保不重复使用同一个预测或真实诊断
            if (pair1['pred_idx'] == pair2['pred_idx'] or 
                pair1['truth_idx'] == pair2['truth_idx']):
                continue
            
            # 计算相似度差异
            sim_diff = abs(pair1['similarity'] - pair2['similarity'])
            
            if sim_diff > best_variance:
                best_variance = sim_diff
                best_pair_combo = (pair1, pair2)
    
    if best_pair_combo:
        pair1, pair2 = best_pair_combo
        return [
            {
                'pair_id': 'A',
                'predicted': pair1['predicted'],
                'ground_truth': pair1['ground_truth'],
                'similarity': pair1['similarity']
            },
            {
                'pair_id': 'B',
                'predicted': pair2['predicted'],
                'ground_truth': pair2['ground_truth'],
                'similarity': pair2['similarity']
            }
        ]
    else:
        # 降级：随机选择两对
        return create_default_pairs(pred_diff_list, truth_diff_list, similarity_matrix)


def create_default_pairs(
    pred_diff_list: List[str],
    truth_diff_list: List[str],
    similarity_matrix: Optional[List[List[float]]] = None
) -> List[Dict]:
    """创建默认的两对诊断"""
    pairs = []
    
    for i in range(2):
        pred_idx = min(i, len(pred_diff_list) - 1) if pred_diff_list else 0
        truth_idx = min(i, len(truth_diff_list) - 1) if truth_diff_list else 0
        
        pred = pred_diff_list[pred_idx] if pred_diff_list else "无预测诊断"
        truth = truth_diff_list[truth_idx] if truth_diff_list else "无真实诊断"
        
        if similarity_matrix and pred_idx < len(similarity_matrix) and truth_idx < len(similarity_matrix[pred_idx]):
            similarity = similarity_matrix[pred_idx][truth_idx]
        else:
            similarity = calculate_jaccard_similarity(pred, truth)
        
        pairs.append({
            'pair_id': chr(65 + i),
            'predicted': pred,
            'ground_truth': truth,
            'similarity': round(similarity, 4)
        })
    
    return pairs


def process_evaluation_data(
    eval_file: str,
    medical_file: str,
    output_file: str,
    use_dermlip: bool = True
) -> List[Dict]:
    """
    处理评估数据，匹配图片路径，生成标准格式
    """
    print(f"读取评估数据: {eval_file}")
    with open(eval_file, 'r', encoding='utf-8') as f:
        eval_data = json.load(f)
    
    print(f"读取医疗数据: {medical_file}")
    with open(medical_file, 'r', encoding='utf-8') as f:
        medical_data = json.load(f)
    
    print(f"评估数据: {len(eval_data.get('per_sample_results', []))} 个病例")
    print(f"医疗数据: {len(medical_data)} 个病例")
    
    # 统计变量
    processed_cases = []
    matched_count = 0
    fallback_count = 0
    no_image_count = 0
    total_path_replaced = 0
    
    per_sample_results = eval_data.get('per_sample_results', [])
    
    print(f"\n{'='*70}")
    print(f"开始处理病例（共 {len(per_sample_results)} 个）...")
    print(f"{'='*70}")
    
    start_time = datetime.now()
    
    for idx, sample in enumerate(per_sample_results):
        # 每处理500个病例显示一次进度
        if (idx + 1) % 500 == 0 or idx == 0:
            elapsed = (datetime.now() - start_time).total_seconds()
            speed = (idx + 1) / elapsed if elapsed > 0 else 0
            eta = (len(per_sample_results) - idx - 1) / speed if speed > 0 else 0
            
            print(f"\n进度: {idx + 1}/{len(per_sample_results)} ({(idx+1)/len(per_sample_results)*100:.1f}%)")
            print(f"  ├─ GT匹配成功: {matched_count}")
            print(f"  ├─ 顺序匹配: {fallback_count}")
            print(f"  ├─ 无图片: {no_image_count}")
            print(f"  ├─ 路径已替换: {total_path_replaced}")
            print(f"  ├─ 处理速度: {speed:.1f} 个/秒")
            print(f"  └─ 预计剩余时间: {eta/60:.1f} 分钟")
        
        case_id = sample.get('id', f'case_{idx}')
        
        # 提取预测和真实的鉴别诊断
        pred_diff = sample.get('predicted_differential', [])
        truth_diff = sample.get('ground_truth_differential', [])
        
        if not isinstance(pred_diff, list):
            pred_diff = []
        if not isinstance(truth_diff, list):
            truth_diff = []
        
        # 获取相似度矩阵
        similarity_matrix = None
        if use_dermlip:
            dermlip_metrics = sample.get('dermlip_metrics', {})
            similarity_matrix = dermlip_metrics.get('similarity_matrix', None)
        
        # 匹配medical_data以获取image_paths和prompt
        matched_item = match_case_by_gt(sample, medical_data)
        
        if matched_item:
            matched_count += 1
            image_paths = matched_item.get('image_paths', [])
            prompt = matched_item.get('prompt', '')
        else:
            # 尝试按顺序匹配（作为后备方案）
            fallback_count += 1
            if idx < len(medical_data):
                image_paths = medical_data[idx].get('image_paths', [])
                prompt = medical_data[idx].get('prompt', '')
            else:
                image_paths = []
                prompt = ''
        
        # 统计无图片的病例
        if not image_paths or len(image_paths) == 0:
            no_image_count += 1
        
        # 替换路径前缀
        image_paths, replaced_count = replace_path_prefix(image_paths)
        total_path_replaced += replaced_count
        
        # 生成task3_pairs：选择相似度波动大的两对
        task3_pairs = generate_task3_pairs(
            pred_diff, 
            truth_diff, 
            similarity_matrix
        )
        
        # 构建病例数据
        case_data = {
            "id": case_id,
            "pmid": case_id,
            
            # 任务1：图片路径和提示词
            "image_paths": image_paths,
            "prompt": prompt,
            
            # 任务2：诊断
            "predicted_diagnosis": sample.get('predicted_differential_text', ''),
            "ground_truth_diagnosis": ' | '.join(truth_diff) if truth_diff else '',
            
            # 任务3：两对诊断及相似度
            "task3_pairs": task3_pairs,
            
            # 额外信息
            "predicted_differential_diagnosis_full": pred_diff,
            "ground_truth_differential_diagnosis_full": truth_diff,
            
            # 相似度波动指标
            "similarity_variance": calculate_similarity_variance(task3_pairs),
            "similarity_range": calculate_similarity_range(task3_pairs)
        }
        
        processed_cases.append(case_data)
    
    # 最终统计
    print(f"\n{'='*70}")
    print(f"步骤1处理完成！")
    print(f"{'='*70}")
    print(f"总处理病例: {len(processed_cases)}")
    print(f"GT匹配成功: {matched_count} ({matched_count/len(processed_cases)*100:.1f}%)")
    print(f"顺序匹配: {fallback_count} ({fallback_count/len(processed_cases)*100:.1f}%)")
    print(f"无图片路径: {no_image_count} ({no_image_count/len(processed_cases)*100:.1f}%)")
    print(f"路径已替换: {total_path_replaced}")
    
    # 保存处理后的数据
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(processed_cases, f, ensure_ascii=False, indent=2)
    
    print(f"\n临时数据已保存到: {output_file}")
    
    return processed_cases


def validate_and_filter_data(
    input_file: str,
    output_file: str,
    max_cases: int = 50,
    min_similarity_variance: float = 0.0
) -> Tuple[List[Dict], List[Dict]]:
    """
    验证并筛选数据，优先保留相似度波动大的病例
    """
    print(f"\n{'='*70}")
    print("步骤2: 开始数据筛选和验证")
    print(f"{'='*70}")
    
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    print(f"读取临时数据: {len(data)} 个病例")
    
    valid_cases = []
    removed_cases = []
    
    # 统计各种移除原因
    reason_stats = {
        '包含None值': 0,
        'task3_pairs问题': 0,
        '诊断为空': 0,
        '诊断一致': 0,
        '无图片路径': 0,
        '缺少必需字段': 0,
        '相似度波动过小': 0
    }
    
    print(f"\n开始验证...")
    
    for idx, case in enumerate(data):
        if (idx + 1) % 1000 == 0:
            print(f"  验证进度: {idx + 1}/{len(data)} ({(idx+1)/len(data)*100:.1f}%)")
        
        case_id = case.get('pmid', case.get('id', f'case_{idx}'))
        remove_reasons = []
        
        # 规则1: 检查是否有None值
        if has_none_values(case):
            remove_reasons.append("包含None值")
            reason_stats['包含None值'] += 1
        
        # 规则2: 检查task3_pairs
        task3_valid, task3_reason = validate_task3_pairs(case.get('task3_pairs', []))
        if not task3_valid:
            remove_reasons.append(task3_reason)
            reason_stats['task3_pairs问题'] += 1
        
        # 规则3: 检查诊断是否一致
        pred_diag = case.get('predicted_diagnosis', '')
        truth_diag = case.get('ground_truth_diagnosis', '')
        
        if not pred_diag or not truth_diag:
            remove_reasons.append("诊断为空")
            reason_stats['诊断为空'] += 1
        elif diagnoses_are_same(pred_diag, truth_diag):
            remove_reasons.append(f"诊断完全一致")
            reason_stats['诊断一致'] += 1
        
        # 规则4: 检查图片路径
        image_paths = case.get('image_paths', [])
        if not image_paths or len(image_paths) == 0:
            remove_reasons.append("无图片路径")
            reason_stats['无图片路径'] += 1
        
        # 规则5: 检查必需字段
        required_fields = ['id', 'pmid', 'prompt']
        for field in required_fields:
            if not case.get(field):
                remove_reasons.append(f"缺少必需字段: {field}")
                reason_stats['缺少必需字段'] += 1
                break
        
        # 规则6: 检查相似度波动
        sim_variance = case.get('similarity_variance', 0.0)
        if sim_variance < min_similarity_variance:
            remove_reasons.append(f"相似度波动过小: {sim_variance:.4f} < {min_similarity_variance}")
            reason_stats['相似度波动过小'] += 1
        
        if remove_reasons:
            removed_cases.append({
                'case_id': case_id,
                'reasons': remove_reasons,
                'predicted_diagnosis': pred_diag,
                'ground_truth_diagnosis': truth_diag,
                'similarity_variance': case.get('similarity_variance', 0.0)
            })
        else:
            valid_cases.append(case)
    
    print(f"\n基本验证完成:")
    print(f"  通过验证: {len(valid_cases)} 个")
    print(f"  未通过验证: {len(removed_cases)} 个")
    
    print(f"\n未通过原因统计:")
    for reason, count in sorted(reason_stats.items(), key=lambda x: x[1], reverse=True):
        if count > 0:
            print(f"  • {reason}: {count} 个")
    
    # 按相似度波动排序，选择波动最大的病例
    if len(valid_cases) > max_cases:
        print(f"\n{'='*70}")
        print(f"有效病例数({len(valid_cases)})超过目标数({max_cases})，开始按相似度波动排序...")
        print(f"{'='*70}")
        
        # 按相似度波动（标准差和极差的组合）降序排序
        valid_cases.sort(
            key=lambda x: (
                x.get('similarity_variance', 0) * 0.6 + 
                x.get('similarity_range', 0) * 0.4
            ),
            reverse=True
        )
        
        # 显示波动分布
        print(f"\n相似度波动分析:")
        print(f"  前10个病例的方差: {[round(c.get('similarity_variance', 0), 4) for c in valid_cases[:10]]}")
        print(f"  后10个病例的方差: {[round(c.get('similarity_variance', 0), 4) for c in valid_cases[-10:]]}")
        
        # 保留前max_cases个
        extra_cases = valid_cases[max_cases:]
        valid_cases = valid_cases[:max_cases]
        
        print(f"\n保留前{max_cases}个波动最大的病例")
        print(f"额外移除: {len(extra_cases)} 个病例（相似度波动较小）")
        
        # 将多余的病例加入移除列表
        for case in extra_cases:
            removed_cases.append({
                'case_id': case.get('pmid', case.get('id')),
                'reasons': [f'相似度波动较小，未进入前{max_cases}名'],
                'predicted_diagnosis': case.get('predicted_diagnosis', ''),
                'ground_truth_diagnosis': case.get('ground_truth_diagnosis', ''),
                'similarity_variance': case.get('similarity_variance', 0.0)
            })
    
    # 保存有效数据
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(valid_cases, f, ensure_ascii=False, indent=2)
    
    # 输出最终统计信息
    print(f"\n{'='*70}")
    print("筛选完成！最终统计")
    print(f"{'='*70}")
    print(f"原始病例数: {len(data)}")
    print(f"✓ 最终保留: {len(valid_cases)} 个")
    print(f"✗ 移除总数: {len(removed_cases)} 个")
    print(f"保留比例: {len(valid_cases)/len(data)*100:.2f}%")
    
    # 统计最终保留病例的相似度波动
    if valid_cases:
        variances = [c.get('similarity_variance', 0) for c in valid_cases]
        ranges = [c.get('similarity_range', 0) for c in valid_cases]
        
        print(f"\n保留病例的相似度波动统计:")
        print(f"  方差统计:")
        print(f"    平均值: {np.mean(variances):.4f}")
        print(f"    中位数: {np.median(variances):.4f}")
        print(f"    最大值: {np.max(variances):.4f}")
        print(f"    最小值: {np.min(variances):.4f}")
        print(f"  极差统计:")
        print(f"    平均值: {np.mean(ranges):.4f}")
        print(f"    中位数: {np.median(ranges):.4f}")
        print(f"    最大值: {np.max(ranges):.4f}")
        print(f"    最小值: {np.min(ranges):.4f}")
    
    print(f"\n✓ 最终数据已保存到: {output_file}")
    print(f"{'='*70}\n")
    
    return valid_cases, removed_cases


def has_none_values(obj, path="") -> bool:
    """递归检查对象中是否有None值"""
    if obj is None:
        return True
    
    if isinstance(obj, dict):
        for key, value in obj.items():
            if has_none_values(value, f"{path}.{key}"):
                return True
    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            if has_none_values(item, f"{path}[{i}]"):
                return True
    
    return False


def validate_task3_pairs(pairs: List[Dict]) -> Tuple[bool, str]:
    """验证task3_pairs"""
    if not pairs or len(pairs) != 2:
        return False, f"task3_pairs数量必须为2个 (当前: {len(pairs) if pairs else 0})"
    
    for i, pair in enumerate(pairs):
        if not isinstance(pair, dict):
            return False, f"task3_pairs[{i}]不是字典"
        
        required_fields = ['pair_id', 'predicted', 'ground_truth', 'similarity']
        for field in required_fields:
            if field not in pair:
                return False, f"task3_pairs[{i}]缺少字段: {field}"
            if pair[field] is None:
                return False, f"task3_pairs[{i}].{field}为None"
    
    pair_a, pair_b = pairs[0], pairs[1]
    
    if pair_a.get('pair_id') == pair_b.get('pair_id'):
        return False, "两对的pair_id相同"
    
    if (pair_a.get('predicted') == pair_b.get('predicted') and 
        pair_a.get('ground_truth') == pair_b.get('ground_truth')):
        return False, "两对的诊断内容完全相同"
    
    return True, ""


def diagnoses_are_same(diag1: str, diag2: str) -> bool:
    """判断两个诊断是否相同"""
    if not diag1 or not diag2:
        return False
    
    d1 = normalize_diagnosis(diag1)
    d2 = normalize_diagnosis(diag2)
    
    if d1 == d2:
        return True
    
    # 检查包含关系
    if d1 in d2 or d2 in d1:
        len_ratio = min(len(d1), len(d2)) / max(len(d1), len(d2))
        if len_ratio > 0.8:
            return True
    
    return False


def main():
    """主函数"""
    print("\n" + "="*70)
    print(" " * 20 + "医疗数据处理和筛选脚本")
    print("="*70)
    print(f"开始时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*70)
    
    # 配置文件路径
    eval_file = "scin_dd_evaluation.json"
    medical_file = "SCIN_DD_input.json"
    temp_output = "data_temp.json"
    final_output = "data_filtered.json"
    
    # 步骤1: 处理和匹配数据
    print("\n📋 步骤1: 处理评估数据并匹配图片路径")
    print("-" * 70)
    try:
        processed_data = process_evaluation_data(
            eval_file=eval_file,
            medical_file=medical_file,
            output_file=temp_output,
            use_dermlip=True
        )
    except Exception as e:
        print(f"\n❌ 错误: 步骤1处理失败")
        print(f"错误信息: {str(e)}")
        return
    
    # 步骤2: 筛选数据
    print("\n📊 步骤2: 筛选数据（优先保留相似度波动大的病例）")
    print("-" * 70)
    try:
        valid_cases, removed_cases = validate_and_filter_data(
            input_file=temp_output,
            output_file=final_output,
            max_cases=50,
            min_similarity_variance=0.0
        )
    except Exception as e:
        print(f"\n❌ 错误: 步骤2筛选失败")
        print(f"错误信息: {str(e)}")
        return
    
    # 显示示例
    if valid_cases:
        print("="*70)
        print("✓ 处理完成！以下是第一个病例示例:")
        print("="*70)
        example = valid_cases[0]
        print(f"\n病例ID: {example.get('id')}")
        print(f"图片数量: {len(example.get('image_paths', []))}")
        if example.get('image_paths'):
            print(f"图片路径示例: {example.get('image_paths')[0]}")
        print(f"预测诊断: {example.get('predicted_diagnosis', '')[:80]}...")
        print(f"真实诊断: {example.get('ground_truth_diagnosis', '')[:80]}...")
        print(f"相似度方差: {example.get('similarity_variance', 0):.4f}")
        print(f"相似度极差: {example.get('similarity_range', 0):.4f}")
        print("\nTask3配对:")
        for pair in example.get('task3_pairs', []):
            print(f"  {pair['pair_id']}对:")
            print(f"    预测: {pair['predicted']}")
            print(f"    真实: {pair['ground_truth']}")
            print(f"    相似度: {pair['similarity']}")
    
    print("\n" + "="*70)
    print(f"结束时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*70)
    print("\n✓ 所有处理完成！")
    print(f"✓ 最终数据保存在: {final_output}")
    print(f"✓ 临时数据保存在: {temp_output}")
    print("="*70 + "\n")


if __name__ == "__main__":
    main()