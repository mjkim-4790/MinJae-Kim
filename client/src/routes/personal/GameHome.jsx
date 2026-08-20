import PersonalLayout from '../../components/personal/PersonalLayout.jsx';
import OperatorEvents from '../operator/OperatorEvents.jsx';

// 게임 카테고리 — MC 전용과 완전히 같은 이벤트 목록/생성/운영 화면을 그대로 재사용한다
// (사용자 결정: 일반인 전용 계정도 누구나 게임을 만들고 참여자를 초대할 수 있어야 하므로,
// 화면을 새로 만들지 않고 기존 운영자 화면을 그대로 가져다 쓴다). 이벤트 상세로 들어가면
// (/operator/events/:id) 탭바가 없는 전체 화면으로 전환되고, 뒤로가기로 다시 여기로
// 돌아온다.
export default function GameHome() {
  return (
    <PersonalLayout>
      <OperatorEvents />
    </PersonalLayout>
  );
}
