import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/** value 를 QR 이미지(data URL)로 렌더링. 참여 코드가 아니라 /join/{코드} 전체 주소를 넣는다. */
export default function QrCode({ value, size = 220 }) {
  const [dataUrl, setDataUrl] = useState(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { width: size, margin: 1 }).then((url) => {
      if (!cancelled) setDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!dataUrl) {
    return <div className="qrcode qrcode--loading" style={{ width: size, height: size }} />;
  }

  return (
    <img
      className="qrcode"
      src={dataUrl}
      alt={`참여 QR 코드 (${value})`}
      width={size}
      height={size}
    />
  );
}
