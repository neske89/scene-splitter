"""Rebuild the committed 32×32-input SwinIR x8 ONNX model from official weights.

Usage: python scripts/export-swinir.py --source /path/to/SwinIR --weights /path/to/x8.pth
Requires pinned CPU torch, timm, onnx, onnxruntime and numpy; see README.
"""
import argparse
import hashlib
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch

parser = argparse.ArgumentParser()
parser.add_argument('--source', type=Path, required=True)
parser.add_argument('--weights', type=Path, required=True)
parser.add_argument('--output', type=Path, default=Path('vendor/models/swinir/x8/model.onnx'))
args = parser.parse_args()
sys.path.insert(0, str(args.source.resolve()))
from models.network_swinir import SwinIR  # noqa: E402

expected = '6b522c1ea5c21006ce3398797eb20b131ca0024cc6e7b8f3d5d29fad1310a49c'
assert hashlib.sha256(args.weights.read_bytes()).hexdigest() == expected, 'Unexpected source weights'
torch.set_num_threads(4)
torch.manual_seed(123)
model = SwinIR(upscale=8, in_chans=3, img_size=32, window_size=8, img_range=1.,
               depths=[6] * 6, embed_dim=180, num_heads=[6] * 6, mlp_ratio=2,
               upsampler='pixelshuffle', resi_connection='1conv')
weights = torch.load(args.weights, map_location='cpu', weights_only=True)
# Attention masks depend on tile size, so keep the masks generated for 32×32.
state = {key: value for key, value in weights['params'].items() if not key.endswith('attn_mask')}
missing, unexpected = model.load_state_dict(state, strict=False)
assert not unexpected and all(key.endswith('attn_mask') for key in missing)
model.eval()
sample = torch.rand(1, 3, 32, 32)
with torch.no_grad():
    reference = model(sample).numpy()
args.output.parent.mkdir(parents=True, exist_ok=True)
torch.onnx.export(model, sample, str(args.output), input_names=['input'], output_names=['output'],
                  opset_version=17, do_constant_folding=True, dynamo=False)
session = ort.InferenceSession(str(args.output), providers=['CPUExecutionProvider'])
actual = session.run(None, {'input': sample.numpy()})[0]
assert actual.shape == (1, 3, 256, 256)
difference = float(np.max(np.abs(reference - actual)))
assert difference < .001, difference
print('ONNX:', args.output, 'SHA-256:', hashlib.sha256(args.output.read_bytes()).hexdigest(),
      'maximum PyTorch difference:', difference)
