"""CUDA / multi-GPU device selection for YOLO inference."""
import os

MODEL_KEYS = ('person', 'cigarette', 'smoke', 'vape', 'face')

_resolved_devices = None
_primary_device = 'cpu'
_model_devices = {}


def _env_bool(name, default=True):
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {'1', 'true', 'yes', 'on'}


def _parse_cuda_device_list():
    raw = (os.getenv('SMOKEDET_CUDA_DEVICES') or '').strip()
    if not raw:
        return None
    devices = []
    for part in raw.split(','):
        part = part.strip()
        if not part:
            continue
        if part.isdigit():
            devices.append(f'cuda:{int(part)}')
        elif part.startswith('cuda'):
            devices.append(part)
    return devices or None


def _torch_cuda_info():
    try:
        import torch
    except ImportError:
        return False, 0, []
    if not torch.cuda.is_available():
        return False, 0, []
    count = torch.cuda.device_count()
    names = []
    for i in range(count):
        try:
            names.append(torch.cuda.get_device_name(i))
        except Exception:
            names.append(f'GPU {i}')
    return True, count, names


def resolve_devices():
    global _resolved_devices, _primary_device, _model_devices
    if _resolved_devices is not None:
        return _resolved_devices

    want = (os.getenv('SMOKEDET_DEVICE') or 'auto').strip().lower()
    explicit = _parse_cuda_device_list()
    cuda_ok, cuda_count, _gpu_names = _torch_cuda_info()

    if want == 'cpu':
        _resolved_devices = ['cpu']
        _primary_device = 'cpu'
    elif explicit:
        _resolved_devices = explicit
        _primary_device = explicit[0]
    elif want.startswith('cuda'):
        _primary_device = want if ':' in want else 'cuda:0'
        _resolved_devices = [_primary_device] if cuda_ok else ['cpu']
        if not cuda_ok:
            _primary_device = 'cpu'
    elif cuda_ok and cuda_count > 0:
        _resolved_devices = [f'cuda:{i}' for i in range(cuda_count)]
        _primary_device = _resolved_devices[0]
    else:
        _resolved_devices = ['cpu']
        _primary_device = 'cpu'

    _model_devices = {}
    for idx, key in enumerate(MODEL_KEYS):
        if _resolved_devices == ['cpu']:
            _model_devices[key] = 'cpu'
        else:
            _model_devices[key] = _resolved_devices[idx % len(_resolved_devices)]

    return _resolved_devices


def device_for_model(model_key):
    resolve_devices()
    return _model_devices.get(model_key, _primary_device)


def use_fp16():
    resolve_devices()
    return _env_bool('SMOKEDET_YOLO_HALF', True) and _primary_device.startswith('cuda')


def warmup_model(model, device):
    import numpy as np
    dummy = np.zeros((480, 640, 3), dtype=np.uint8)
    kwargs = {'device': device, 'verbose': False}
    if use_fp16() and device.startswith('cuda'):
        kwargs['half'] = True
    try:
        model.predict(dummy, **kwargs)
    except Exception as exc:
        print(f"[GPU] Warmup skipped on {device}: {exc}")


def gpu_status():
    cuda_ok, cuda_count, gpu_names = _torch_cuda_info()
    devices = resolve_devices()
    return {
        'cuda_available': cuda_ok,
        'gpu_count': cuda_count,
        'gpu_names': gpu_names,
        'inference_devices': devices,
        'primary_device': _primary_device,
        'model_device_map': dict(_model_devices),
        'fp16_enabled': use_fp16(),
        'mode': 'gpu_farm' if len(devices) > 1 and devices[0].startswith('cuda') else (
            'gpu' if devices[0].startswith('cuda') else 'cpu'
        ),
    }
